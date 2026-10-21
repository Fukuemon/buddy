package mysql

import (
	"context"
	"database/sql"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/mysql/sqlcgen"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
)

// StaffRepository は、staff.Repository を実装する。
type StaffRepository struct{ conn }

// NewStaffRepository は StaffRepository を作る。
func NewStaffRepository(db *sql.DB) *StaffRepository { return &StaffRepository{conn{db}} }

// Create は、職員と権限を続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *StaffRepository) Create(ctx context.Context, s staff.Staff, grants []staff.Grant) error {
	q := r.q(ctx)
	err := q.CreateUser(ctx, sqlcgen.CreateUserParams{
		ID:           s.ID,
		Sub:          nullString(s.Sub),
		Username:     s.Username,
		Email:        s.Email,
		PhoneNumber:  nullString(s.PhoneNumber),
		FacilityID:   s.FacilityID,
		DepartmentID: s.DepartmentID,
		TeamID:       s.TeamID,
		PositionID:   s.PositionID,
	})
	if err != nil {
		return translate("create user", err)
	}
	return addGrants(ctx, q, s.ID, grants)
}

// ChangePosition は、役職の更新、権限の削除、権限の追加を続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *StaffRepository) ChangePosition(ctx context.Context, id, positionID string, grants []staff.Grant) error {
	q := r.q(ctx)
	if err := q.UpdateUserPosition(ctx, sqlcgen.UpdateUserPositionParams{ID: id, PositionID: positionID}); err != nil {
		return translate("update user position", err)
	}
	if err := q.DeleteUserPolicies(ctx, id); err != nil {
		return translate("delete user policies", err)
	}
	return addGrants(ctx, q, id, grants)
}

// AddGrant は、権限と対象を続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *StaffRepository) AddGrant(ctx context.Context, id string, g staff.Grant) error {
	return addGrants(ctx, r.q(ctx), id, []staff.Grant{g})
}

// RemoveGrant は、職員 id の権限 userPolicyID を消す。対象は外部キーの ON DELETE CASCADE で消える。
func (r *StaffRepository) RemoveGrant(ctx context.Context, id, userPolicyID string) error {
	n, err := r.q(ctx).DeleteUserPolicy(ctx, sqlcgen.DeleteUserPolicyParams{ID: userPolicyID, UserID: id})
	if err != nil {
		return translate("delete user policy", err)
	}
	if n == 0 {
		return apperr.ErrNotFound
	}
	return nil
}

func addGrants(ctx context.Context, q *sqlcgen.Queries, userID string, grants []staff.Grant) error {
	for _, g := range grants {
		if err := q.AddUserPolicy(ctx, sqlcgen.AddUserPolicyParams{ID: g.ID, UserID: userID, PolicyID: g.PolicyID}); err != nil {
			return translate("add user policy", err)
		}
		for _, t := range g.Targets {
			err := q.AddUserPolicyTarget(ctx, sqlcgen.AddUserPolicyTargetParams{
				ID: t.ID, UserPolicyID: g.ID, TargetUserID: optional(t.UserID), TargetTeamID: optional(t.TeamID),
			})
			if err != nil {
				return translate("add user policy target", err)
			}
		}
	}
	return nil
}

// Get は、ID が id の職員を、部署、チーム、役職の名前と、権限（名前の順）と権限の対象の職員を付けて返す。無いときは apperr.ErrNotFound を返す。
func (r *StaffRepository) Get(ctx context.Context, id string) (staff.Detail, error) {
	q := r.q(ctx)
	u, err := q.GetUser(ctx, id)
	if err != nil {
		return staff.Detail{}, translate("get user", err)
	}
	policies, err := q.ListUserPolicies(ctx, []string{id})
	if err != nil {
		return staff.Detail{}, translate("list user policies", err)
	}
	targets, err := q.ListUserPolicyTargets(ctx, id)
	if err != nil {
		return staff.Detail{}, translate("list user policy targets", err)
	}
	users := make(map[string][]string)
	teams := make(map[string][]string)
	for _, t := range targets {
		if t.TargetUserID.Valid {
			users[t.UserPolicyID] = append(users[t.UserPolicyID], t.TargetUserID.String)
		}
		if t.TargetTeamID.Valid {
			teams[t.UserPolicyID] = append(teams[t.UserPolicyID], t.TargetTeamID.String)
		}
	}
	grants := make([]staff.PolicyGrant, len(policies))
	for i, p := range policies {
		grants[i] = staff.PolicyGrant{
			UserPolicyID:  p.UserPolicyID,
			PolicyID:      p.PolicyID,
			PolicyCode:    organization.PolicyCode(p.PolicyCode),
			PolicyName:    p.PolicyName,
			TargetUserIDs: nonNil(users[p.UserPolicyID]),
			TargetTeamIDs: nonNil(teams[p.UserPolicyID]),
		}
	}
	return staff.Detail{Summary: staffSummary(sqlcgen.ListUsersByFacilityRow(u)), Policies: grants}, nil
}

// ListByFacility は、事業所 facilityID の職員のうち q の条件にすべて合うものを、q.Sort の順（同じ値は ID の順）に返す。
// 名前、役職、部署、チームは完全一致で絞る。権限は付けない。
func (r *StaffRepository) ListByFacility(ctx context.Context, facilityID string, q staff.ListQuery) ([]staff.Summary, error) {
	rows, err := r.q(ctx).ListUsersByFacility(ctx, sqlcgen.ListUsersByFacilityParams{
		FacilityID: facilityID,
		Username:   nullString(q.Username),
		Position:   nullString(q.Position),
		Department: nullString(q.Department),
		Team:       nullString(q.Team),
		Sort:       q.Sort.Key(),
	})
	if err != nil {
		return nil, translate("list users", err)
	}
	out := make([]staff.Summary, len(rows))
	for i, u := range rows {
		out[i] = staffSummary(u)
	}
	return out, nil
}

func staffSummary(u sqlcgen.ListUsersByFacilityRow) staff.Summary {
	return staff.Summary{
		Staff: staff.Staff{
			ID:           u.ID,
			Sub:          stringPtr(u.Sub),
			Username:     u.Username,
			Email:        u.Email,
			PhoneNumber:  stringPtr(u.PhoneNumber),
			FacilityID:   u.FacilityID,
			DepartmentID: u.DepartmentID,
			TeamID:       u.TeamID,
			PositionID:   u.PositionID,
		},
		DepartmentName: u.DepartmentName,
		TeamName:       u.TeamName,
		PositionName:   u.PositionName,
		CreatedAt:      u.CreatedAt,
		UpdatedAt:      u.UpdatedAt,
	}
}

// FindIDBySub は、認証のブローカーの Sub が sub の職員の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *StaffRepository) FindIDBySub(ctx context.Context, sub string) (string, error) {
	id, err := r.q(ctx).GetUserIDBySub(ctx, sql.NullString{String: sub, Valid: true})
	return id, translate("get user by sub", err)
}

// LinkSub は、事業所 facilityID の、メールが email で Sub がまだない職員にだけ sub を書く。当たる職員がいなければ何もせず、エラーも返さない。
// 同時に呼ばれても書くのは 1 回だけである。sub が別の職員と重なるときは apperr.ErrConflict を返す。
func (r *StaffRepository) LinkSub(ctx context.Context, facilityID, email, sub string) error {
	err := r.q(ctx).LinkUserSub(ctx, sqlcgen.LinkUserSubParams{
		Sub: sql.NullString{String: sub, Valid: true}, FacilityID: facilityID, Email: email,
	})
	return translate("link user sub", err)
}

// StaffRefRepository は、ほかの機能が職員を参照するための kernel.Finder[staff.Ref] を実装する。
type StaffRefRepository struct{ conn }

// NewStaffRefRepository は StaffRefRepository を作る。
func NewStaffRefRepository(db *sql.DB) *StaffRefRepository { return &StaffRefRepository{conn{db}} }

// Get は、ID が id の職員の事業所とチームを返す。無いときは apperr.ErrNotFound を返す。
func (r *StaffRefRepository) Get(ctx context.Context, id string) (staff.Ref, error) {
	row, err := r.q(ctx).GetUserRef(ctx, id)
	if err != nil {
		return staff.Ref{}, translate("get user ref", err)
	}
	return staff.Ref{ID: row.ID, FacilityID: row.FacilityID, TeamID: row.TeamID}, nil
}

// ListByFacility は、事業所 facilityID の職員の事業所とチームを ID の順に返す。
func (r *StaffRefRepository) ListByFacility(ctx context.Context, facilityID string) ([]staff.Ref, error) {
	rows, err := r.q(ctx).ListUserRefsByFacility(ctx, facilityID)
	if err != nil {
		return nil, translate("list user refs", err)
	}
	out := make([]staff.Ref, len(rows))
	for i, row := range rows {
		out[i] = staff.Ref{ID: row.ID, FacilityID: row.FacilityID, TeamID: row.TeamID}
	}
	return out, nil
}
