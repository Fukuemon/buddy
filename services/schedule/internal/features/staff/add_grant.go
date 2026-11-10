package staff

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// GrantInput は、職員に足す権限と対象である。対象は、権限の code に合わせて職員かチームを指定する。
type GrantInput struct {
	PolicyID      string
	TargetUserIDs []string
	TargetTeamIDs []string
}

// AddGrant は、職員に権限を 1 つ足す。
type AddGrant struct {
	staff    Repository
	policies kernel.Finder[organization.Policy]
	teams    kernel.Finder[organization.Team]
	audit    audit.Recorder
	tx       tx.Transactor
	ids      kernel.IDGenerator
	guard    kernel.Guard
}

// NewAddGrant は AddGrant を作る。
func NewAddGrant(staff Repository, policies kernel.Finder[organization.Policy], teams kernel.Finder[organization.Team], rec audit.Recorder, tx tx.Transactor, ids kernel.IDGenerator, guard kernel.Guard) AddGrant {
	return AddGrant{staff: staff, policies: policies, teams: teams, audit: rec, tx: tx, ids: ids, guard: guard}
}

// Do は、職員に権限を 1 つ足す。対象を指定する権限には、職員を対象にする権限なら職員を、
// チームを対象にする権限ならチームを 1 つ以上指定する。対象を指定しない権限には、対象を指定できない。
// 職員が見つからないときは apperr.ErrNotFound を、権限、対象が合わないか別の事業所のものであるときは入力のエラーを、
// 同じ権限が既にあるときは apperr.ErrConflict を返す。
// 職員の管理の権限が無いときは apperr.ErrForbidden を返す。
// 同じトランザクションで、変更の前後の権限を監査の記録に書き、書けなければ権限も足さない（ADR-0042）。
func (s AddGrant) Do(ctx context.Context, id string, in GrantInput) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.staff.Get(ctx, id)
		if err != nil {
			return err
		}
		before := auditState(cur)
		p, err := s.policies.Get(ctx, in.PolicyID)
		if err != nil {
			return apperr.Reference("権限", in.PolicyID, err)
		}
		g := Grant{ID: s.ids.NewID(), PolicyID: p.ID}
		g.Targets, err = s.targets(ctx, p, cur.FacilityID, in)
		if err != nil {
			return err
		}
		if err := s.staff.AddGrant(ctx, cur.ID, g); err != nil {
			return apperr.AsConflict(err, "職員はすでに権限 %s を持っています", p.Name)
		}
		changed, err = s.staff.Get(ctx, cur.ID)
		if err != nil {
			return err
		}
		return recordChange(ctx, s.audit, audit.GrantAdd, &before, changed)
	})
	return changed, err
}

// targets は、権限 p の対象を確認し、同じ事業所 facilityID の職員かチームの対象を作る。
func (s AddGrant) targets(ctx context.Context, p organization.Policy, facilityID string, in GrantInput) ([]Target, error) {
	users, teams := in.TargetUserIDs, in.TargetTeamIDs
	switch {
	case !p.NeedsTarget:
		if len(users) > 0 || len(teams) > 0 {
			return nil, apperr.Invalid("権限 %s は対象を指定できません", p.ID)
		}
		return nil, nil
	case p.Code.IsTeamTarget():
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
		st, err := s.staff.Get(ctx, uid)
		if err != nil {
			return nil, apperr.Reference("職員", uid, err)
		}
		if err := organization.RequireSameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
			return nil, err
		}
		if seen[uid] {
			return nil, apperr.Invalid("職員 %s が重なっています", uid)
		}
		seen[uid] = true
		out = append(out, Target{ID: s.ids.NewID(), UserID: st.ID})
	}
	for _, tid := range teams {
		t, err := s.teams.Get(ctx, tid)
		if err != nil {
			return nil, apperr.Reference("チーム", tid, err)
		}
		if err := organization.RequireSameFacility("チーム", t.ID, t.FacilityID, facilityID); err != nil {
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
