package httpapi

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

func toStaff(s staff.Summary) openapi.Staff {
	var email *string
	if s.Email != "" {
		email = &s.Email
	}
	return openapi.Staff{
		Id:              s.ID,
		Username:        s.Username,
		Email:           email,
		PhoneNumber:     s.PhoneNumber,
		FacilityId:      s.FacilityID,
		Department:      openapi.Ref{Id: s.DepartmentID, Name: s.DepartmentName},
		Team:            openapi.Ref{Id: s.TeamID, Name: s.TeamName},
		Position:        openapi.Ref{Id: s.PositionID, Name: s.PositionName},
		Visits:          !s.NonVisiting,
		Status:          openapi.StaffStatus(s.Status()),
		LeaveStartedAt:  s.LeaveStartedAt,
		LeaveReturnDate: stringPtr(s.LeaveReturnDate),
		RetiredAt:       s.RetiredAt,
		CreatedAt:       s.CreatedAt,
		UpdatedAt:       s.UpdatedAt,
	}
}

func toStaffDetail(d staff.Detail) openapi.StaffDetail {
	s := toStaff(d.Summary)
	return openapi.StaffDetail{
		Id:              s.Id,
		Username:        s.Username,
		Email:           s.Email,
		PhoneNumber:     s.PhoneNumber,
		FacilityId:      s.FacilityId,
		Department:      s.Department,
		Team:            s.Team,
		Position:        s.Position,
		Visits:          s.Visits,
		Status:          s.Status,
		LeaveStartedAt:  s.LeaveStartedAt,
		LeaveReturnDate: s.LeaveReturnDate,
		RetiredAt:       s.RetiredAt,
		CreatedAt:       s.CreatedAt,
		UpdatedAt:       s.UpdatedAt,
		Sub:             d.Sub,
		Policies: mapSlice(d.Policies, func(p staff.PolicyGrant) openapi.StaffDetail_Policies {
			return openapi.StaffDetail_Policies{
				UserPolicyId: p.UserPolicyID, PolicyId: p.PolicyID, Code: string(p.PolicyCode), Name: p.PolicyName,
				TargetUserIds: p.TargetUserIDs, TargetTeamIds: p.TargetTeamIDs,
			}
		}),
	}
}

// GetMe は、認証のミドルウェアが特定した職員の詳細を、staff の取得の操作で読んで返す。
func (s server) GetMe(ctx context.Context, _ openapi.GetMeRequestObject) (openapi.GetMeResponseObject, error) {
	p, ok := principal.From(ctx)
	if !ok {
		return nil, errors.New("認証のミドルウェアを通らずに GET /v1/me を呼びました")
	}
	d, err := s.u.Staff.Get(ctx, p.Staff.ID)
	if err != nil {
		return nil, err
	}
	return openapi.GetMe200JSONResponse(toStaffDetail(d)), nil
}

func (s server) GetUser(ctx context.Context, req openapi.GetUserRequestObject) (openapi.GetUserResponseObject, error) {
	d, err := s.u.Staff.Get(ctx, req.UserId)
	if err != nil {
		return nil, err
	}
	return openapi.GetUser200JSONResponse(toStaffDetail(d)), nil
}

func (s server) ListUsers(ctx context.Context, req openapi.ListUsersRequestObject) (openapi.ListUsersResponseObject, error) {
	p := req.Params
	sort, err := staff.ParseSort(value(p.SortField), value(p.SortOrder))
	if err != nil {
		return nil, err
	}
	ss, err := s.u.Staff.List(ctx, req.FacilityId, staff.ListQuery{
		Username:   nonEmpty(p.Username),
		Position:   nonEmpty(p.Position),
		Department: nonEmpty(p.Department),
		Team:       nonEmpty(p.Team),
		Sort:       sort,
	})
	if err != nil {
		return nil, err
	}
	return openapi.ListUsers200JSONResponse(mapSlice(ss, toStaff)), nil
}

func (s server) CreateUser(ctx context.Context, req openapi.CreateUserRequestObject) (openapi.CreateUserResponseObject, error) {
	b := req.Body
	d, err := s.u.Staff.Create(ctx, staff.CreateInput{
		FacilityID:   req.FacilityId,
		Username:     b.Username,
		Email:        b.Email,
		PhoneNumber:  b.PhoneNumber,
		DepartmentID: b.DepartmentId,
		TeamID:       b.TeamId,
		PositionID:   b.PositionId,
		NonVisiting:  b.Visits != nil && !*b.Visits,
	})
	if err != nil {
		return nil, err
	}
	return openapi.CreateUser201JSONResponse(toStaffDetail(d)), nil
}

// ChangeUserPosition は、職員の役職を変え、前の役職のデフォルトの権限を新しい役職のデフォルトの権限に置き換えた職員を返す。
func (s server) ChangeUserPosition(ctx context.Context, req openapi.ChangeUserPositionRequestObject) (openapi.ChangeUserPositionResponseObject, error) {
	d, err := s.u.Staff.ChangePosition(ctx, req.UserId, req.Body.PositionId)
	if err != nil {
		return nil, err
	}
	return openapi.ChangeUserPosition200JSONResponse(toStaffDetail(d)), nil
}

// UpdateUser は、職員の名前、電話番号、部署、チーム、訪問するかを変え、変えた職員を返す。
// 予定か担当の利用者が残る職員を訪問しない職員に変えようとしたときは、残る一覧を付けた 409 を返す。
func (s server) UpdateUser(ctx context.Context, req openapi.UpdateUserRequestObject) (openapi.UpdateUserResponseObject, error) {
	b := req.Body
	d, err := s.u.Staff.UpdateProfile(ctx, req.UserId, staff.Profile{
		Username:     b.Username,
		PhoneNumber:  b.PhoneNumber,
		DepartmentID: b.DepartmentId,
		TeamID:       b.TeamId,
		NonVisiting:  !b.Visits,
	})
	if ae, ok := errors.AsType[*staff.AssignedError](err); ok {
		a := toAssignments(ae.Assignments)
		return openapi.UpdateUser409JSONResponse{Code: "staff_has_assignments", Message: ae.Error(), Assignments: &a}, nil
	}
	if err != nil {
		return nil, err
	}
	return openapi.UpdateUser200JSONResponse(toStaffDetail(d)), nil
}

// AddUserPolicy は、職員に権限を足し、権限つきの職員を返す。
func (s server) AddUserPolicy(ctx context.Context, req openapi.AddUserPolicyRequestObject) (openapi.AddUserPolicyResponseObject, error) {
	b := req.Body
	d, err := s.u.Staff.AddGrant(ctx, req.UserId, staff.GrantInput{
		PolicyID:      b.PolicyId,
		TargetUserIDs: ids(b.TargetUserIds),
		TargetTeamIDs: ids(b.TargetTeamIds),
	})
	if err != nil {
		return nil, err
	}
	return openapi.AddUserPolicy201JSONResponse(toStaffDetail(d)), nil
}

// RemoveUserPolicy は、職員の権限を外し、権限つきの職員を返す。
func (s server) RemoveUserPolicy(ctx context.Context, req openapi.RemoveUserPolicyRequestObject) (openapi.RemoveUserPolicyResponseObject, error) {
	d, err := s.u.Staff.RemoveGrant(ctx, req.UserId, req.UserPolicyId)
	if err != nil {
		return nil, err
	}
	return openapi.RemoveUserPolicy200JSONResponse(toStaffDetail(d)), nil
}

// StartUserLeave は、職員を休職にし、休職にした職員と、その日以降に残る予定と担当の利用者を返す。
func (s server) StartUserLeave(ctx context.Context, req openapi.StartUserLeaveRequestObject) (openapi.StartUserLeaveResponseObject, error) {
	var in staff.LeaveInput
	if req.Body.ReturnDate != nil {
		d, err := bodyDate(*req.Body.ReturnDate)
		if err != nil {
			return nil, err
		}
		in.ReturnDate = &d
	}
	c, err := s.u.Staff.Leave(ctx, req.UserId, in)
	if err != nil {
		return nil, err
	}
	return openapi.StartUserLeave200JSONResponse(toStatusChange(c)), nil
}

// ReinstateUser は、休職の職員を復職にし、戻した職員を返す。
func (s server) ReinstateUser(ctx context.Context, req openapi.ReinstateUserRequestObject) (openapi.ReinstateUserResponseObject, error) {
	d, err := s.u.Staff.Reinstate(ctx, req.UserId)
	if err != nil {
		return nil, err
	}
	return openapi.ReinstateUser200JSONResponse(toStaffDetail(d)), nil
}

// RetireUser は、職員を退職にし、退職にした職員を返す。予定か担当の利用者が残るときは、残る一覧を付けた 409 を返す。
func (s server) RetireUser(ctx context.Context, req openapi.RetireUserRequestObject) (openapi.RetireUserResponseObject, error) {
	c, err := s.u.Staff.Retire(ctx, req.UserId)
	if ae, ok := errors.AsType[*staff.AssignedError](err); ok {
		a := toAssignments(ae.Assignments)
		return openapi.RetireUser409JSONResponse{Code: "staff_has_assignments", Message: ae.Error(), Assignments: &a}, nil
	}
	if err != nil {
		return nil, err
	}
	return openapi.RetireUser200JSONResponse(toStatusChange(c)), nil
}

// GetUserRemainingAssignments は、職員の今日以降に残る予定と担当の利用者を返す。
func (s server) GetUserRemainingAssignments(ctx context.Context, req openapi.GetUserRemainingAssignmentsRequestObject) (openapi.GetUserRemainingAssignmentsResponseObject, error) {
	a, err := s.u.Staff.RemainingAssignments(ctx, req.UserId)
	if err != nil {
		return nil, err
	}
	return openapi.GetUserRemainingAssignments200JSONResponse(toAssignments(a)), nil
}

func toStatusChange(c staff.StatusChange) openapi.StaffStatusChange {
	return openapi.StaffStatusChange{Staff: toStaffDetail(c.Staff), Assignments: toAssignments(c.Assignments)}
}

func toAssignments(a staff.Assignments) openapi.StaffAssignments {
	return openapi.StaffAssignments{
		Schedules: mapSlice(a.Schedules, func(s staff.AssignedSchedule) openapi.StaffAssignments_Schedules {
			return openapi.StaffAssignments_Schedules{Id: s.ID, Date: s.Date.String(), StartTime: s.StartTime.String(), EndTime: s.EndTime.String(), EndsNextDay: s.EndsNextDay}
		}),
		RecurringSchedules: mapSlice(a.RecurringSchedules, func(r staff.AssignedRecurring) openapi.StaffAssignments_RecurringSchedules {
			return openapi.StaffAssignments_RecurringSchedules{
				Id: r.ID, Date: r.Date.String(), EndDate: stringPtr(r.EndDate), StartTime: r.StartTime.String(), EndTime: r.EndTime.String(), EndsNextDay: r.EndsNextDay,
			}
		}),
		Patients: mapSlice(a.Patients, func(p staff.AssignedPatient) openapi.StaffAssignments_Patients {
			return openapi.StaffAssignments_Patients{Id: p.ID, Name: p.Name}
		}),
	}
}

// ids は、省略できる ID の配列を返す。省略されたときは nil を返す。
func ids(p *[]openapi.ID) []string {
	if p == nil {
		return nil
	}
	return *p
}
