package staff

import (
	"context"
	"errors"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CodeManagerExists は、有効なマネージャーがいる事業所に、明示の許可なしにマネージャーを足そうとしたことを表す 409 の code である。
const CodeManagerExists = "manager_exists"

// OnboardInput は、事業所と最初のマネージャーの登録の入力である。
// AllowAdditionalManager は、職員の管理の権限を持つ有効な職員が既にいる事業所に、マネージャーを足すことを許す。
// 全てのマネージャーが退職したときの復旧に使う。DryRun は、書き込まずに書く内容だけを返す。
type OnboardInput struct {
	Facility               organization.SetupFacilityInput
	Username               string
	Email                  string
	AllowAdditionalManager bool
	DryRun                 bool
}

// OnboardResult は、Onboard が書いたか、DryRun で書くはずだったものである。
// ManagerCreated が false なら、Manager は既にいた職員で、何も書いていない。DryRun のときの ID は、書かなかった仮の値である。
type OnboardResult struct {
	Setup          organization.FacilitySetup
	Manager        Detail
	ManagerCreated bool
	DryRun         bool
}

// Onboard は、事業所、標準の役職、最初のマネージャーを 1 つのトランザクションで登録する。運営用の CLI が使う。
type Onboard struct {
	setup  func(ctx context.Context, in organization.SetupFacilityInput) (organization.FacilitySetup, error)
	create func(ctx context.Context, in CreateInput) (Detail, error)
	staff  Repository
	locks  FacilityLock
	tx     tx.Transactor
}

// NewOnboard は Onboard を作る。setup は organization.SetupFacility の Do で、create は Create の Do である。
func NewOnboard(setup func(ctx context.Context, in organization.SetupFacilityInput) (organization.FacilitySetup, error), create func(ctx context.Context, in CreateInput) (Detail, error), staff Repository, locks FacilityLock, tx tx.Transactor) Onboard {
	return Onboard{setup: setup, create: create, staff: staff, locks: locks, tx: tx}
}

// errDryRun は、DryRun のときにトランザクションを戻すための番兵のエラーである。
var errDryRun = errors.New("dry run")

// Do は、1 つのトランザクションの中で、事業所と標準の役職と部署とチームを無ければ作り、web からの職員の登録と同じ create で
// マネージャーの役職の職員を登録する。create はブローカーに職員を登録して有効にするので、ブローカーへの書き込みが失敗すると、
// 事業所を含む予定の API の書き込みを全て戻す。
//
//   - 同じメールの職員が事業所に職員の管理の権限を持つ有効な職員としていれば、何も書かずに、その職員を返す（同じ引数での流し直し）。
//   - 同じメールの職員がそれ以外の状態でいれば、apperr.ErrConflict を返す。
//   - 職員の管理の権限を持つ有効な職員がほかにいて、in.AllowAdditionalManager が false なら、code が CodeManagerExists の
//     apperr.ErrConflict を返す。
//   - in.DryRun なら、ブローカーを呼ばず、トランザクションを戻して、書くはずだったものを返す。
func (o Onboard) Do(ctx context.Context, in OnboardInput) (OnboardResult, error) {
	email := NormalizeEmail(in.Email)
	res := OnboardResult{DryRun: in.DryRun}
	err := o.tx.WithinTx(ctx, func(ctx context.Context) error {
		setup, err := o.setup(ctx, in.Facility)
		if err != nil {
			return err
		}
		res.Setup = setup
		fid := setup.Facility.ID
		if err := o.locks.Lock(ctx, fid); err != nil {
			return err
		}
		if found, ok, err := o.findByEmail(ctx, fid, email); err != nil {
			return err
		} else if ok {
			if found.Status() != StatusActive || !hasStaffManage(found) {
				return apperr.Conflict("メール %s の職員は、この事業所に職員の管理の権限を持たない職員としているか、有効でありません", email)
			}
			res.Manager = found
			if in.DryRun {
				return errDryRun
			}
			return nil
		}
		managers, err := o.staff.ActiveManagers(ctx, fid)
		if err != nil {
			return err
		}
		if len(managers) > 0 && !in.AllowAdditionalManager {
			return apperr.ConflictCode(CodeManagerExists, "事業所 %s には職員の管理の権限を持つ有効な職員がいます。足すときは明示のフラグを付けます", fid)
		}
		cin := CreateInput{
			FacilityID:   fid,
			Username:     in.Username,
			Email:        email,
			DepartmentID: setup.Department.ID,
			TeamID:       setup.Team.ID,
			PositionID:   setup.ManagerPosition.ID,
		}
		if in.DryRun {
			res.Manager, err = o.plan(cin, setup)
			if err != nil {
				return err
			}
			res.ManagerCreated = true
			return errDryRun
		}
		if res.Manager, err = o.create(ctx, cin); err != nil {
			return err
		}
		res.ManagerCreated = true
		return nil
	})
	if errors.Is(err, errDryRun) {
		return res, nil
	}
	if err != nil {
		return OnboardResult{}, err
	}
	return res, nil
}

// findByEmail は、事業所 facilityID のメールが email の職員を返す。退職した職員はメールを持たないので見つからない。
func (o Onboard) findByEmail(ctx context.Context, facilityID, email string) (Detail, bool, error) {
	list, err := o.staff.ListByFacility(ctx, facilityID, ListQuery{})
	if err != nil {
		return Detail{}, false, err
	}
	i := slices.IndexFunc(list, func(s Summary) bool { return s.Email == email })
	if i < 0 {
		return Detail{}, false, nil
	}
	d, err := o.staff.Get(ctx, list[i].ID)
	return d, err == nil, err
}

// plan は、DryRun のときに、create が書くはずの職員を、入力を確認してから返す。ID と Sub は空にする。
func (o Onboard) plan(in CreateInput, setup organization.FacilitySetup) (Detail, error) {
	st, err := New(NewParams{
		Username:     in.Username,
		Email:        in.Email,
		FacilityID:   in.FacilityID,
		DepartmentID: in.DepartmentID,
		TeamID:       in.TeamID,
		PositionID:   in.PositionID,
	})
	if err != nil {
		return Detail{}, err
	}
	d := Detail{Summary: Summary{
		Staff:          st,
		DepartmentName: setup.Department.Name,
		TeamName:       setup.Team.Name,
		PositionName:   setup.ManagerPosition.Name,
	}}
	for _, p := range setup.ManagerPosition.Policies {
		d.Policies = append(d.Policies, PolicyGrant{PolicyID: p.ID, PolicyCode: p.Code, PolicyName: p.Name})
	}
	return d, nil
}

func hasStaffManage(d Detail) bool {
	return slices.ContainsFunc(d.Policies, func(g PolicyGrant) bool { return g.PolicyCode == organization.StaffManage })
}
