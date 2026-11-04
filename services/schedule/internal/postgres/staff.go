package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// StaffRepository は、staff.Repository を実装する。
type StaffRepository struct{ conn }

// NewStaffRepository は StaffRepository を作る。
func NewStaffRepository(pool *pgxpool.Pool) *StaffRepository { return &StaffRepository{conn{pool}} }

// Create は、職員と権限を続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *StaffRepository) Create(ctx context.Context, s staff.Staff, grants []staff.Grant) error {
	q := r.q(ctx)
	err := q.CreateUser(ctx, sqlcgen.CreateUserParams{
		ID:           s.ID,
		Sub:          s.Sub,
		Username:     s.Username,
		Email:        optional(s.Email),
		PhoneNumber:  s.PhoneNumber,
		FacilityID:   s.FacilityID,
		DepartmentID: s.DepartmentID,
		TeamID:       s.TeamID,
		PositionID:   s.PositionID,
		Visits:       !s.NonVisiting,
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

// UpdateProfile は、職員の更新と、チームの対象の移し替えを続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
// 職員が無いときは apperr.ErrNotFound を、退職した職員なら apperr.ErrConflict を返す。
func (r *StaffRepository) UpdateProfile(ctx context.Context, id string, p staff.Profile, oldTeamID string) error {
	q := r.q(ctx)
	n, err := q.UpdateUserProfile(ctx, sqlcgen.UpdateUserProfileParams{
		ID: id, Username: p.Username, PhoneNumber: p.PhoneNumber, DepartmentID: p.DepartmentID, TeamID: p.TeamID, Visits: !p.NonVisiting,
	})
	if err != nil {
		return translate("update user profile", err)
	}
	if err := r.unchanged(ctx, id, n); err != nil || oldTeamID == p.TeamID {
		return err
	}
	if err := q.DeleteUserTeamTargetsCovered(ctx, sqlcgen.DeleteUserTeamTargetsCoveredParams{
		UserID: id, OldTeamID: ptr(oldTeamID), NewTeamID: ptr(p.TeamID),
	}); err != nil {
		return translate("delete user team targets", err)
	}
	err = q.MoveUserTeamTargets(ctx, sqlcgen.MoveUserTeamTargetsParams{UserID: id, OldTeamID: ptr(oldTeamID), NewTeamID: ptr(p.TeamID)})
	return translate("move user team targets", err)
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
		n, err := q.AddUserPolicy(ctx, sqlcgen.AddUserPolicyParams{ID: g.ID, UserID: userID, PolicyID: g.PolicyID})
		if err != nil {
			return translate("add user policy", err)
		}
		if n == 0 {
			return apperr.Invalid("職員 %s が見つかりません", userID)
		}
		for _, t := range g.Targets {
			n, err := q.AddUserPolicyTarget(ctx, sqlcgen.AddUserPolicyTargetParams{
				ID: t.ID, UserPolicyID: g.ID, TargetUserID: optional(t.UserID), TargetTeamID: optional(t.TeamID),
			})
			if err != nil {
				return translate("add user policy target", err)
			}
			if n == 0 {
				return apperr.Invalid("職員の権限 %s が見つかりません", g.ID)
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
		if t.TargetUserID != nil {
			users[t.UserPolicyID] = append(users[t.UserPolicyID], *t.TargetUserID)
		}
		if t.TargetTeamID != nil {
			teams[t.UserPolicyID] = append(teams[t.UserPolicyID], *t.TargetTeamID)
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
		Username:   q.Username,
		Position:   q.Position,
		Department: q.Department,
		Team:       q.Team,
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
			ID:              u.ID,
			Sub:             u.Sub,
			Username:        u.Username,
			Email:           deref(u.Email),
			PhoneNumber:     u.PhoneNumber,
			FacilityID:      u.FacilityID,
			DepartmentID:    u.DepartmentID,
			TeamID:          u.TeamID,
			PositionID:      u.PositionID,
			NonVisiting:     !u.Visits,
			LeaveStartedAt:  u.LeaveStartedAt,
			LeaveReturnDate: datePtr(u.LeaveReturnDate),
			RetiredAt:       u.RetiredAt,
		},
		DepartmentName: u.DepartmentName,
		TeamName:       u.TeamName,
		PositionName:   u.PositionName,
		CreatedAt:      u.CreatedAt,
		UpdatedAt:      u.UpdatedAt,
	}
}

// FindIDBySub は、ID ブローカーの Sub が sub の職員の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *StaffRepository) FindIDBySub(ctx context.Context, sub string) (string, error) {
	id, err := r.q(ctx).GetUserIDBySub(ctx, ptr(sub))
	return id, translate("get user by sub", err)
}

// StartLeave は、職員 id を休職にした時刻と戻る予定の日を書く。休職にし直しても、最初に休職にした時刻を残す。
// 職員が無いときは apperr.ErrNotFound を、退職した職員なら apperr.ErrConflict を返す。
func (r *StaffRepository) StartLeave(ctx context.Context, id string, returnDate *civil.Date) error {
	n, err := r.q(ctx).StartUserLeave(ctx, sqlcgen.StartUserLeaveParams{ID: id, ReturnDate: nullDate(returnDate)})
	if err != nil {
		return translate("start user leave", err)
	}
	return r.unchanged(ctx, id, n)
}

// EndLeave は、職員 id の休職を外す。職員が無いときは apperr.ErrNotFound を、退職した職員なら apperr.ErrConflict を返す。
func (r *StaffRepository) EndLeave(ctx context.Context, id string) error {
	n, err := r.q(ctx).EndUserLeave(ctx, id)
	if err != nil {
		return translate("end user leave", err)
	}
	return r.unchanged(ctx, id, n)
}

// unchanged は、退職した職員を書かない更新が n 行を変えたときの結果を返す。変えていなければ、職員がいるかで
// apperr.ErrNotFound か apperr.ErrConflict を返す。
func (r *StaffRepository) unchanged(ctx context.Context, id string, n int64) error {
	if n > 0 {
		return nil
	}
	if _, err := r.q(ctx).GetUserRef(ctx, id); err != nil {
		return translate("get user ref", err)
	}
	return apperr.ErrConflict
}

// Retire は、職員 id を退職にし、メールと電話番号を消す。退職にし直しても、最初に退職にした時刻を残す。
// 職員が無いときは apperr.ErrNotFound を返す。
func (r *StaffRepository) Retire(ctx context.Context, id string) error {
	n, err := r.q(ctx).RetireUser(ctx, id)
	if err != nil {
		return translate("retire user", err)
	}
	if n == 0 {
		return apperr.ErrNotFound
	}
	return nil
}

// ActiveManagers は、事業所 facilityID で職員の管理の権限を持つ、休職でも退職でもない職員の ID を ID の順に返す。
func (r *StaffRepository) ActiveManagers(ctx context.Context, facilityID string) ([]string, error) {
	ids, err := r.q(ctx).ListActiveStaffManagers(ctx, facilityID)
	if err != nil {
		return nil, translate("list active staff managers", err)
	}
	return ids, nil
}

// StaffAssignmentReader は、staff.AssignmentReader を、予定、繰り返しの予定、利用者のテーブルで実装する。
type StaffAssignmentReader struct{ conn }

// NewStaffAssignmentReader は StaffAssignmentReader を作る。
func NewStaffAssignmentReader(pool *pgxpool.Pool) *StaffAssignmentReader {
	return &StaffAssignmentReader{conn{pool}}
}

// From は、事業所 facilityID の職員 staffID の、from 以降のキャンセルしていない予定（日時の順）と、from 以降に終わる
// 繰り返しの予定（最初の回の日時の順）と、担当の利用者（名前の順）を返す。
func (r *StaffAssignmentReader) From(ctx context.Context, facilityID, staffID string, from civil.Date) (staff.Assignments, error) {
	q := r.q(ctx)
	scheds, err := q.ListStaffSchedulesFrom(ctx, sqlcgen.ListStaffSchedulesFromParams{FacilityID: facilityID, StaffID: staffID, FromDate: from.Time()})
	if err != nil {
		return staff.Assignments{}, translate("list staff schedules", err)
	}
	recs, err := q.ListStaffRecurringSchedulesFrom(ctx, sqlcgen.ListStaffRecurringSchedulesFromParams{FacilityID: facilityID, StaffID: staffID, FromDate: from.Time()})
	if err != nil {
		return staff.Assignments{}, translate("list staff recurring schedules", err)
	}
	pats, err := q.ListStaffAssignedPatients(ctx, sqlcgen.ListStaffAssignedPatientsParams{FacilityID: facilityID, AssignedStaffID: staffID})
	if err != nil {
		return staff.Assignments{}, translate("list staff assigned patients", err)
	}
	out := staff.Assignments{
		Schedules:          make([]staff.AssignedSchedule, len(scheds)),
		RecurringSchedules: make([]staff.AssignedRecurring, len(recs)),
		Patients:           make([]staff.AssignedPatient, len(pats)),
	}
	for i, s := range scheds {
		start, end, err := slotTimes(s.StartTime, s.EndTime)
		if err != nil {
			return staff.Assignments{}, err
		}
		out.Schedules[i] = staff.AssignedSchedule{ID: s.ID, Date: civil.DateOf(s.Date), StartTime: start, EndTime: end}
	}
	for i, s := range recs {
		start, end, err := slotTimes(s.StartTime, s.EndTime)
		if err != nil {
			return staff.Assignments{}, err
		}
		out.RecurringSchedules[i] = staff.AssignedRecurring{ID: s.ID, Date: civil.DateOf(s.Date), EndDate: datePtr(s.EndDate), StartTime: start, EndTime: end}
	}
	for i, p := range pats {
		out.Patients[i] = staff.AssignedPatient{ID: p.ID, Name: p.Name}
	}
	return out, nil
}

// StaffRefRepository は、ほかの機能が職員を参照するための kernel.Finder[staff.Ref] を実装する。
type StaffRefRepository struct{ conn }

// NewStaffRefRepository は StaffRefRepository を作る。
func NewStaffRefRepository(pool *pgxpool.Pool) *StaffRefRepository {
	return &StaffRefRepository{conn{pool}}
}

// Get は、ID が id の職員の事業所、チーム、訪問するか、状態を返す。無いときは apperr.ErrNotFound を返す。
func (r *StaffRefRepository) Get(ctx context.Context, id string) (staff.Ref, error) {
	row, err := r.q(ctx).GetUserRef(ctx, id)
	if err != nil {
		return staff.Ref{}, translate("get user ref", err)
	}
	return staffRef(row.ID, row.FacilityID, row.TeamID, row.Visits, row.LeaveStartedAt, row.RetiredAt), nil
}

// ListByFacility は、事業所 facilityID の職員の事業所、チーム、訪問するか、状態を ID の順に返す。
func (r *StaffRefRepository) ListByFacility(ctx context.Context, facilityID string) ([]staff.Ref, error) {
	rows, err := r.q(ctx).ListUserRefsByFacility(ctx, facilityID)
	if err != nil {
		return nil, translate("list user refs", err)
	}
	out := make([]staff.Ref, len(rows))
	for i, row := range rows {
		out[i] = staffRef(row.ID, row.FacilityID, row.TeamID, row.Visits, row.LeaveStartedAt, row.RetiredAt)
	}
	return out, nil
}

func staffRef(id, facilityID, teamID string, visits bool, leaveStartedAt, retiredAt *time.Time) staff.Ref {
	st := staff.Staff{LeaveStartedAt: leaveStartedAt, RetiredAt: retiredAt}
	return staff.Ref{ID: id, FacilityID: facilityID, TeamID: teamID, Status: st.Status(), NonVisiting: !visits}
}
