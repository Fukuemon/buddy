package mysql

import (
	"context"
	"database/sql"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/mysql/sqlcgen"
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
	for _, g := range grants {
		if err := q.AddUserPolicy(ctx, sqlcgen.AddUserPolicyParams{ID: g.ID, UserID: s.ID, PolicyID: g.PolicyID}); err != nil {
			return translate("add user policy", err)
		}
	}
	return nil
}

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
	targetsByPolicy := make(map[string][]string)
	for _, t := range targets {
		targetsByPolicy[t.UserPolicyID] = append(targetsByPolicy[t.UserPolicyID], t.TargetUserID)
	}
	grants := make([]staff.PolicyGrant, len(policies))
	for i, p := range policies {
		ids := targetsByPolicy[p.UserPolicyID]
		if ids == nil {
			ids = []string{}
		}
		grants[i] = staff.PolicyGrant{
			UserPolicyID: p.UserPolicyID, PolicyID: p.PolicyID, PolicyName: p.PolicyName, TargetUserIDs: ids,
		}
	}
	return staff.Detail{Summary: staffSummary(sqlcgen.ListUsersByFacilityRow(u)), Policies: grants}, nil
}

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

func (r *StaffRepository) FindIDBySub(ctx context.Context, sub string) (string, error) {
	id, err := r.q(ctx).GetUserIDBySub(ctx, sql.NullString{String: sub, Valid: true})
	return id, translate("get user by sub", err)
}

func (r *StaffRepository) LinkSub(ctx context.Context, facilityID, email, sub string) error {
	err := r.q(ctx).LinkUserSub(ctx, sqlcgen.LinkUserSubParams{
		Sub: sql.NullString{String: sub, Valid: true}, FacilityID: facilityID, Email: email,
	})
	return translate("link user sub", err)
}
