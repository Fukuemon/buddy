package httpapi

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
)

// StaffUsecase は、職員のハンドラが使う操作である。
type StaffUsecase interface {
	Create(ctx context.Context, in staff.CreateInput) (staff.Detail, error)
	Get(ctx context.Context, id string) (staff.Detail, error)
	List(ctx context.Context, facilityID string, q staff.ListQuery) ([]staff.Summary, error)
	ChangePosition(ctx context.Context, id, positionID string) (staff.Detail, error)
	AddGrant(ctx context.Context, id string, in staff.GrantInput) (staff.Detail, error)
	RemoveGrant(ctx context.Context, id, userPolicyID string) (staff.Detail, error)
}

func toStaff(s staff.Summary) openapi.Staff {
	return openapi.Staff{
		Id:          s.ID,
		Username:    s.Username,
		Email:       s.Email,
		PhoneNumber: s.PhoneNumber,
		FacilityId:  s.FacilityID,
		Department:  openapi.Ref{Id: s.DepartmentID, Name: s.DepartmentName},
		Team:        openapi.Ref{Id: s.TeamID, Name: s.TeamName},
		Position:    openapi.Ref{Id: s.PositionID, Name: s.PositionName},
		CreatedAt:   s.CreatedAt,
		UpdatedAt:   s.UpdatedAt,
	}
}

func toStaffDetail(d staff.Detail) openapi.StaffDetail {
	s := toStaff(d.Summary)
	return openapi.StaffDetail{
		Id:          s.Id,
		Username:    s.Username,
		Email:       s.Email,
		PhoneNumber: s.PhoneNumber,
		FacilityId:  s.FacilityId,
		Department:  s.Department,
		Team:        s.Team,
		Position:    s.Position,
		CreatedAt:   s.CreatedAt,
		UpdatedAt:   s.UpdatedAt,
		Sub:         d.Sub,
		Policies: mapSlice(d.Policies, func(p staff.PolicyGrant) openapi.StaffDetail_Policies {
			return openapi.StaffDetail_Policies{
				UserPolicyId: p.UserPolicyID, PolicyId: p.PolicyID, Code: string(p.PolicyCode), Name: p.PolicyName,
				TargetUserIds: p.TargetUserIDs, TargetTeamIds: p.TargetTeamIDs,
			}
		}),
	}
}

// GetMe は、認証のミドルウェアが特定した職員を返す。
func (s server) GetMe(ctx context.Context, _ openapi.GetMeRequestObject) (openapi.GetMeResponseObject, error) {
	p, ok := principal.From(ctx)
	if !ok {
		return nil, errors.New("認証のミドルウェアを通らずに GET /v1/me を呼びました")
	}
	return openapi.GetMe200JSONResponse(toStaffDetail(p.Staff)), nil
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
	})
	if err != nil {
		return nil, err
	}
	return openapi.CreateUser201JSONResponse(toStaffDetail(d)), nil
}

// ChangeUserPosition は、職員の役職を変え、権限を新しい役職の既定で写し直した職員を返す。
func (s server) ChangeUserPosition(ctx context.Context, req openapi.ChangeUserPositionRequestObject) (openapi.ChangeUserPositionResponseObject, error) {
	d, err := s.u.Staff.ChangePosition(ctx, req.UserId, req.Body.PositionId)
	if err != nil {
		return nil, err
	}
	return openapi.ChangeUserPosition200JSONResponse(toStaffDetail(d)), nil
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

// ids は、省略できる ID の配列を返す。省略されたときは nil を返す。
func ids(p *[]openapi.ID) []string {
	if p == nil {
		return nil
	}
	return *p
}
