package staff

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CreateInput は、職員の作成の入力である。NonVisiting は訪問しない職員かで、役職からは決めない（ADR-0022）。
type CreateInput struct {
	FacilityID   string
	Username     string
	Email        string
	PhoneNumber  *string
	DepartmentID string
	TeamID       string
	PositionID   string
	NonVisiting  bool
}

// Create は、職員を作り、役職のデフォルトの権限を与える。
type Create struct {
	facilities  kernel.Finder[organization.Facility]
	departments kernel.Finder[organization.Department]
	teams       kernel.Finder[organization.Team]
	positions   kernel.Finder[organization.Position]
	identities  Identities
	staff       Repository
	tx          tx.Transactor
	ids         kernel.IDGenerator
	guard       kernel.Guard
}

// NewCreate は Create を作る。
func NewCreate(facilities kernel.Finder[organization.Facility], departments kernel.Finder[organization.Department], teams kernel.Finder[organization.Team], positions kernel.Finder[organization.Position], identities Identities, staff Repository, tx tx.Transactor, ids kernel.IDGenerator, guard kernel.Guard) Create {
	return Create{facilities: facilities, departments: departments, teams: teams, positions: positions, identities: identities, staff: staff, tx: tx, ids: ids, guard: guard}
}

// Do は、職員を作り、役職のデフォルトの権限を与える。チームを対象にする権限は、職員の所属のチームを対象にする。事業所が見つからないときは apperr.ErrNotFound を、
// 部署、チーム、役職が見つからないか別の事業所のものであるときは入力のエラーを、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 同じ事業所に同じメールの職員がいるか、同じメールの職員がブローカーで止められているか、ほかの事業所にいるときは
// apperr.ErrConflict を返す。ほかの事業所にいることは、文で示さない。
//
// 入力を確認してから、ブローカーに職員を登録の途中の状態で登録させ、返った職員の ID を Sub にして書き、書けたらブローカーの
// 職員を有効にする。登録の途中の職員はログインできないので、ここで書けなかった職員はブローカーに残ってもログインできない。
// ブローカーの登録は同じメールで送り直しても 1 人にまとまるので、失敗した登録は送り直してよい。ここで書けず、ブローカーの職員を
// この呼び出しで作っていて、その ID の職員がまだいなければ、ブローカーの職員を消して戻す。
// 前の登録が書いた後に有効にできなかったときは、送り直すと、書いた職員を有効にしてから返す。
func (s Create) Do(ctx context.Context, in CreateInput) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	f, err := s.facilities.Get(ctx, in.FacilityID)
	if err != nil {
		return Detail{}, err
	}
	dep, err := s.departments.Get(ctx, in.DepartmentID)
	if err != nil {
		return Detail{}, apperr.Reference("部署", in.DepartmentID, err)
	}
	if err := organization.RequireSameFacility("部署", dep.ID, dep.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	team, err := s.teams.Get(ctx, in.TeamID)
	if err != nil {
		return Detail{}, apperr.Reference("チーム", in.TeamID, err)
	}
	if err := organization.RequireSameFacility("チーム", team.ID, team.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	pos, err := s.positions.Get(ctx, in.PositionID)
	if err != nil {
		return Detail{}, apperr.Reference("役職", in.PositionID, err)
	}
	if err := organization.RequireSameFacility("役職", pos.ID, pos.FacilityID, in.FacilityID); err != nil {
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
		NonVisiting:  in.NonVisiting,
	})
	if err != nil {
		return Detail{}, err
	}
	if f.OrgID == "" {
		return Detail{}, apperr.Invalid("事業所 %s は認証の組織に結び付いていないので、職員を登録できません", f.ID)
	}
	reg, err := s.identities.Register(ctx, f.OrgID, st.Email)
	switch {
	case errors.Is(err, ErrEmailTaken):
		return Detail{}, apperr.Conflict("メール %s の職員は登録できません", st.Email)
	case errors.Is(err, ErrIdentitySuspended):
		return Detail{}, apperr.Conflict("メール %s の職員は休職しています", st.Email)
	case err != nil:
		return Detail{}, err
	}
	st.Sub = &reg.ID
	grants := DefaultGrants(pos, team.ID, s.ids)
	var created Detail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.staff.Create(ctx, st, grants); err != nil {
			return apperr.AsConflict(err, "メール %s の職員はこの事業所にすでにいます", st.Email)
		}
		created, err = s.staff.Get(ctx, st.ID)
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
	if err := s.identities.Activate(context.WithoutCancel(ctx), reg.ID); err != nil {
		return Detail{}, fmt.Errorf("職員を書きましたが、ブローカーの職員 %s を有効にできません。同じ本文で送り直してください: %w", reg.ID, err)
	}
	return created, nil
}

// written は、前の登録がブローカーの職員 sub で職員を書き、有効にできずに終わっていれば、書いた職員を返す。
// 書いた職員がいなければ、書けなかったエラー err を返す。
func (s Create) written(ctx context.Context, sub string, err error) (Detail, error) {
	id, ferr := s.staff.FindIDBySub(ctx, sub)
	if errors.Is(ferr, apperr.ErrNotFound) {
		return Detail{}, err
	}
	if ferr != nil {
		return Detail{}, ferr
	}
	return s.staff.Get(ctx, id)
}

// unregister は、予定の API に書けなかった登録のブローカーの職員 sub を消す。同じメールの登録を同時に受け、
// ほかの登録が同じ sub で職員を書いていれば、消さない。ブローカーは登録の途中の職員だけを消すので、ほかの登録が
// 有効にした職員は残る。
func (s Create) unregister(ctx context.Context, sub string) error {
	if _, err := s.staff.FindIDBySub(ctx, sub); !errors.Is(err, apperr.ErrNotFound) {
		return err
	}
	if err := s.identities.Unregister(ctx, sub); err != nil {
		return fmt.Errorf("ブローカーの職員 %s を消せません: %w", sub, err)
	}
	return nil
}
