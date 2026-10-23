package staff

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、Usecase が使うリポジトリと、事業所の中の組織を読む小さなインターフェイスである。
type Deps struct {
	Facilities  kernel.Finder[organization.Facility]
	Departments kernel.Finder[organization.Department]
	Teams       kernel.Finder[organization.Team]
	Positions   kernel.Finder[organization.Position]
	Policies    kernel.Finder[organization.Policy]
	Staff       Repository
	Identities  Identities
	// Self は、ctx のリクエストを送った職員の ID を返す。職員が自分を止める操作を拒むのに使う。nil なら拒まない。
	Self func(ctx context.Context) (string, bool)
}

// Usecase は、職員の操作である。職員の登録と停止と、職員の権限と役職を変える操作は、guard が許すときだけ行う（ADR-0006）。
// 職員の登録と停止は、ブローカーの職員も書く（ADR-0017）。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *Usecase {
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard}
}

// CreateInput は、職員の作成の入力である。
type CreateInput struct {
	FacilityID   string
	Username     string
	Email        string
	PhoneNumber  *string
	DepartmentID string
	TeamID       string
	PositionID   string
}

// Create は、職員を作り、役職のデフォルトの権限を与える。チームを対象にする権限は、職員の所属のチームを対象にする。事業所が見つからないときは apperr.ErrNotFound を、
// 部署、チーム、役職が見つからないか別の事業所のものであるときは入力のエラーを、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 同じ事業所に同じメールの職員がいるか、同じメールの職員がブローカーで止められているか、ほかの事業所にいるときは
// apperr.ErrConflict を返す。ほかの事業所にいることは、文で示さない。
//
// 入力を確認してから、ブローカーに職員を登録の途中の状態で登録させ、返った職員の ID を Sub にして書き、書けたらブローカーの
// 職員を有効にする。登録の途中の職員はログインできないので、ここで書けなかった職員はブローカーに残ってもログインできない。
// ブローカーの登録は同じメールで送り直しても 1 人にまとまるので、失敗した登録は送り直してよい。ここで書けず、ブローカーの職員を
// この呼び出しで作っていて、その ID の職員がまだいなければ、ブローカーの職員を消して戻す。
// 前の登録が書いた後に有効にできなかったときは、送り直すと、書いた職員を有効にしてから返す。
func (s *Usecase) Create(ctx context.Context, in CreateInput) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	f, err := s.deps.Facilities.Get(ctx, in.FacilityID)
	if err != nil {
		return Detail{}, err
	}
	dep, err := s.deps.Departments.Get(ctx, in.DepartmentID)
	if err != nil {
		return Detail{}, apperr.Reference("部署", in.DepartmentID, err)
	}
	if err := apperr.SameFacility("部署", dep.ID, dep.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	team, err := s.deps.Teams.Get(ctx, in.TeamID)
	if err != nil {
		return Detail{}, apperr.Reference("チーム", in.TeamID, err)
	}
	if err := apperr.SameFacility("チーム", team.ID, team.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	pos, err := s.deps.Positions.Get(ctx, in.PositionID)
	if err != nil {
		return Detail{}, apperr.Reference("役職", in.PositionID, err)
	}
	if err := apperr.SameFacility("役職", pos.ID, pos.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	st, err := New(NewParams{
		ID:           s.ids.NewID(),
		Username:     in.Username,
		Email:        in.Email,
		PhoneNumber:  in.PhoneNumber,
		FacilityID:   in.FacilityID,
		DepartmentID: dep.ID,
		TeamID:       team.ID,
		PositionID:   pos.ID,
	})
	if err != nil {
		return Detail{}, err
	}
	if f.OrgID == "" {
		return Detail{}, apperr.Invalid("事業所 %s は認証の組織に結び付いていないので、職員を登録できません", f.ID)
	}
	reg, err := s.deps.Identities.Register(ctx, f.OrgID, st.Email)
	switch {
	case errors.Is(err, ErrEmailTaken):
		return Detail{}, apperr.Conflict("メール %s の職員は登録できません", st.Email)
	case errors.Is(err, ErrIdentitySuspended):
		return Detail{}, apperr.Conflict("メール %s の職員は止められています", st.Email)
	case err != nil:
		return Detail{}, err
	}
	st.Sub = &reg.ID
	grants := DefaultGrants(pos, team.ID, s.ids)
	var created Detail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.deps.Staff.Create(ctx, st, grants); err != nil {
			return apperr.AsConflict(err, "メール %s の職員はこの事業所にすでにいます", st.Email)
		}
		created, err = s.deps.Staff.Get(ctx, st.ID)
		return err
	})
	if err != nil && reg.Created {
		return Detail{}, errors.Join(err, s.unregister(context.WithoutCancel(ctx), reg.ID))
	}
	if errors.Is(err, apperr.ErrConflict) && reg.Pending {
		created, err = s.written(ctx, reg.ID, err)
	}
	if err != nil {
		return Detail{}, err
	}
	if err := s.deps.Identities.Activate(context.WithoutCancel(ctx), reg.ID); err != nil {
		return Detail{}, fmt.Errorf("職員を書きましたが、ブローカーの職員 %s を有効にできません。同じ本文で送り直してください: %w", reg.ID, err)
	}
	return created, nil
}

// written は、前の登録がブローカーの職員 sub で職員を書き、有効にできずに終わっていれば、書いた職員を返す。
// 書いた職員がいなければ、書けなかったエラー err を返す。
func (s *Usecase) written(ctx context.Context, sub string, err error) (Detail, error) {
	id, ferr := s.deps.Staff.FindIDBySub(ctx, sub)
	if errors.Is(ferr, apperr.ErrNotFound) {
		return Detail{}, err
	}
	if ferr != nil {
		return Detail{}, ferr
	}
	return s.deps.Staff.Get(ctx, id)
}

// unregister は、予定の API に書けなかった登録のブローカーの職員 sub を消す。同じメールの登録を同時に受け、
// ほかの登録が同じ sub で職員を書いていれば、消さない。ブローカーは登録の途中の職員だけを消すので、ほかの登録が
// 有効にした職員は残る。
func (s *Usecase) unregister(ctx context.Context, sub string) error {
	if _, err := s.deps.Staff.FindIDBySub(ctx, sub); !errors.Is(err, apperr.ErrNotFound) {
		return err
	}
	if err := s.deps.Identities.Unregister(ctx, sub); err != nil {
		return fmt.Errorf("ブローカーの職員 %s を消せません: %w", sub, err)
	}
	return nil
}

// Suspend は、職員を止め、止めた職員を返す。止めた職員を止めても成功する。職員が見つからないときは apperr.ErrNotFound を、
// 職員の管理の権限が無いときは apperr.ErrForbidden を、自分を止めようとしたときは apperr.ErrConflict を返す。
//
// ブローカーの職員を先に止める。ブローカーで止めた後にここで書けなければ、送り直すとブローカーの停止をやり直してから書く。
// ブローカーが止めた後に Hydra の取り消しに失敗したときも、ここで止めた時刻を書いてからエラーを返し、送り直しで取り消しをやり直させる。
// ブローカーの職員の ID が無いか、ブローカーにいない職員はログインできないので、ここでだけ止める。
func (s *Usecase) Suspend(ctx context.Context, id string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	if s.deps.Self != nil {
		if self, ok := s.deps.Self(ctx); ok && self == id {
			return Detail{}, apperr.Conflict("自分を止めることはできません")
		}
	}
	cur, err := s.deps.Staff.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	var revokeErr error
	if cur.Sub != nil {
		switch err := s.deps.Identities.Suspend(ctx, *cur.Sub); {
		case errors.Is(err, apperr.ErrNotFound):
			// ブローカーにいない職員はログインできないので、ここでだけ止める
		case errors.Is(err, ErrRevokeFailed):
			revokeErr = err
		case err != nil:
			return Detail{}, err
		}
	}
	if err := s.deps.Staff.Suspend(ctx, cur.ID); err != nil {
		return Detail{}, err
	}
	if revokeErr != nil {
		return Detail{}, fmt.Errorf("職員を止めましたが、ログインの取り消しに失敗しました。もう一度止めてください: %w", revokeErr)
	}
	return s.deps.Staff.Get(ctx, cur.ID)
}

// ChangePosition は、職員の役職を positionID にし、職員の権限を新しい役職のデフォルトの権限からコピーし直す。
// ADR-0002 のとおり、職員ごとに足した権限と対象は消える。職員が見つからないときは apperr.ErrNotFound を、
// 役職が見つからないか別の事業所のものであるときは入力のエラーを返す。
func (s *Usecase) ChangePosition(ctx context.Context, id, positionID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.deps.Staff.Get(ctx, id)
		if err != nil {
			return err
		}
		pos, err := s.deps.Positions.Get(ctx, positionID)
		if err != nil {
			return apperr.Reference("役職", positionID, err)
		}
		if err := apperr.SameFacility("役職", pos.ID, pos.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		if err := s.deps.Staff.ChangePosition(ctx, cur.ID, pos.ID, DefaultGrants(pos, cur.TeamID, s.ids)); err != nil {
			return err
		}
		changed, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}

// GrantInput は、職員に足す権限と対象である。対象は、権限の code に合わせて職員かチームを指定する。
type GrantInput struct {
	PolicyID      string
	TargetUserIDs []string
	TargetTeamIDs []string
}

// AddGrant は、職員に権限を 1 つ足す。対象を指定する権限には、職員を対象にする権限なら職員を、
// チームを対象にする権限ならチームを 1 つ以上指定する。対象を指定しない権限には、対象を指定できない。
// 職員が見つからないときは apperr.ErrNotFound を、権限、対象が合わないか別の事業所のものであるときは入力のエラーを、
// 同じ権限が既にあるときは apperr.ErrConflict を返す。
func (s *Usecase) AddGrant(ctx context.Context, id string, in GrantInput) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.deps.Staff.Get(ctx, id)
		if err != nil {
			return err
		}
		p, err := s.deps.Policies.Get(ctx, in.PolicyID)
		if err != nil {
			return apperr.Reference("権限", in.PolicyID, err)
		}
		g := Grant{ID: s.ids.NewID(), PolicyID: p.ID}
		g.Targets, err = s.targets(ctx, p, cur.FacilityID, in)
		if err != nil {
			return err
		}
		if err := s.deps.Staff.AddGrant(ctx, cur.ID, g); err != nil {
			return apperr.AsConflict(err, "職員はすでに権限 %s を持っています", p.Name)
		}
		changed, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}

// targets は、権限 p の対象を確認し、同じ事業所 facilityID の職員かチームの対象を作る。
func (s *Usecase) targets(ctx context.Context, p organization.Policy, facilityID string, in GrantInput) ([]Target, error) {
	users, teams := in.TargetUserIDs, in.TargetTeamIDs
	switch {
	case !p.NeedsTarget:
		if len(users) > 0 || len(teams) > 0 {
			return nil, apperr.Invalid("権限 %s は対象を指定できません", p.ID)
		}
		return nil, nil
	case p.Code.TargetsTeam():
		if len(teams) == 0 || len(users) > 0 {
			return nil, apperr.Invalid("権限 %s にはチームの対象だけを 1 つ以上指定します", p.ID)
		}
	default:
		if len(users) == 0 || len(teams) > 0 {
			return nil, apperr.Invalid("権限 %s には職員の対象だけを 1 つ以上指定します", p.ID)
		}
	}
	out := make([]Target, 0, len(users)+len(teams))
	seen := make(map[string]bool, cap(out))
	for _, uid := range users {
		st, err := s.deps.Staff.Get(ctx, uid)
		if err != nil {
			return nil, apperr.Reference("職員", uid, err)
		}
		if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
			return nil, err
		}
		if seen[uid] {
			return nil, apperr.Invalid("職員 %s が重なっています", uid)
		}
		seen[uid] = true
		out = append(out, Target{ID: s.ids.NewID(), UserID: st.ID})
	}
	for _, tid := range teams {
		t, err := s.deps.Teams.Get(ctx, tid)
		if err != nil {
			return nil, apperr.Reference("チーム", tid, err)
		}
		if err := apperr.SameFacility("チーム", t.ID, t.FacilityID, facilityID); err != nil {
			return nil, err
		}
		if seen[tid] {
			return nil, apperr.Invalid("チーム %s が重なっています", tid)
		}
		seen[tid] = true
		out = append(out, Target{ID: s.ids.NewID(), TeamID: t.ID})
	}
	return out, nil
}

// RemoveGrant は、職員の権限 userPolicyID と、その対象を外す。
// 職員か、職員のその権限が見つからないときは apperr.ErrNotFound を返す。
func (s *Usecase) RemoveGrant(ctx context.Context, id, userPolicyID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.deps.Staff.RemoveGrant(ctx, id, userPolicyID); err != nil {
			return err
		}
		var err error
		changed, err = s.deps.Staff.Get(ctx, id)
		return err
	})
	return changed, err
}

// Get は、職員と権限を返す。
func (s *Usecase) Get(ctx context.Context, id string) (Detail, error) {
	return s.deps.Staff.Get(ctx, id)
}

// List は、事業所の職員を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (s *Usecase) List(ctx context.Context, facilityID string, q ListQuery) ([]Summary, error) {
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return s.deps.Staff.ListByFacility(ctx, facilityID, q)
}
