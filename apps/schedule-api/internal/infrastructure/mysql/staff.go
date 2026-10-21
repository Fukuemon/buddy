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

// Get は、ID が id の職員を、部署、チーム、役職の名前と、権限（名前の順）と権限の対象の職員を付けて返す。無いときは domain.ErrNotFound を返す。
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

// FindIDBySub は、認証のブローカーの Sub が sub の職員の ID を返す。無いときは domain.ErrNotFound を返す。
func (r *StaffRepository) FindIDBySub(ctx context.Context, sub string) (string, error) {
	id, err := r.q(ctx).GetUserIDBySub(ctx, sql.NullString{String: sub, Valid: true})
	return id, translate("get user by sub", err)
}

// LinkSub は、事業所 facilityID の、メールが email で Sub がまだない職員にだけ sub を書く。当たる職員がいなければ何もせず、エラーも返さない。
// 同時に呼ばれても書くのは 1 回だけである。sub が別の職員と重なるときは domain.ErrConflict を返す。
func (r *StaffRepository) LinkSub(ctx context.Context, facilityID, email, sub string) error {
	err := r.q(ctx).LinkUserSub(ctx, sqlcgen.LinkUserSubParams{
		Sub: sql.NullString{String: sub, Valid: true}, FacilityID: facilityID, Email: email,
	})
	return translate("link user sub", err)
}
