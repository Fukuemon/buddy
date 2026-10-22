package httpapi

import (
	"context"
	"log/slog"

	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
)

// OrganizationUsecase は、事業所、部署、チーム、役職、権限のハンドラが使う操作である。
type OrganizationUsecase interface {
	GetFacility(ctx context.Context, id string) (organization.Facility, error)
	GetDepartment(ctx context.Context, id string) (organization.Department, error)
	ListDepartments(ctx context.Context, facilityID string) ([]organization.Department, error)
	GetTeam(ctx context.Context, id string) (organization.Team, error)
	ListTeams(ctx context.Context, facilityID string) ([]organization.Team, error)
	CreateTeam(ctx context.Context, facilityID, name string) (organization.Team, error)
	GetPosition(ctx context.Context, id string) (organization.Position, error)
	ListPositions(ctx context.Context, facilityID string) ([]organization.Position, error)
	CreatePosition(ctx context.Context, facilityID, name string, policyIDs []string) (organization.Position, error)
	GetPolicy(ctx context.Context, id string) (organization.Policy, error)
	ListPolicies(ctx context.Context) ([]organization.Policy, error)
}

func toDepartment(d organization.Department) openapi.Unit {
	return openapi.Unit{Id: d.ID, FacilityId: d.FacilityID, Name: d.Name, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt}
}

func toTeam(t organization.Team) openapi.Unit {
	return openapi.Unit{Id: t.ID, FacilityId: t.FacilityID, Name: t.Name, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt}
}

func toPolicy(p organization.Policy) openapi.Policy {
	return openapi.Policy{
		Id: p.ID, Code: string(p.Code), Name: p.Name, NeedsTarget: p.NeedsTarget, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}

func toPosition(p organization.Position) openapi.Position {
	return openapi.Position{
		Id: p.ID, FacilityId: p.FacilityID, Name: p.Name, Policies: mapSlice(p.Policies, toPolicy),
		CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}

// GetHealthz は、{"status":"ok"} を返す。
func (s server) GetHealthz(context.Context, openapi.GetHealthzRequestObject) (openapi.GetHealthzResponseObject, error) {
	return openapi.GetHealthz200JSONResponse{Status: openapi.HealthStatusOk}, nil
}

// GetReadyz は、依存先に届けば 200 を、届かなければ 503 を返す。
func (s server) GetReadyz(ctx context.Context, _ openapi.GetReadyzRequestObject) (openapi.GetReadyzResponseObject, error) {
	if s.ready != nil {
		if err := s.ready(ctx); err != nil {
			s.log.WarnContext(ctx, "not ready", slog.Any("error", err))
			return openapi.GetReadyz503JSONResponse{Status: openapi.HealthStatusUnavailable}, nil
		}
	}
	return openapi.GetReadyz200JSONResponse{Status: openapi.HealthStatusOk}, nil
}

func (s server) GetFacility(ctx context.Context, req openapi.GetFacilityRequestObject) (openapi.GetFacilityResponseObject, error) {
	f, err := s.u.Organization.GetFacility(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	return openapi.GetFacility200JSONResponse{Id: f.ID, Name: f.Name, CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt}, nil
}

func (s server) GetDepartment(ctx context.Context, req openapi.GetDepartmentRequestObject) (openapi.GetDepartmentResponseObject, error) {
	d, err := s.u.Organization.GetDepartment(ctx, req.DepartmentId)
	if err != nil {
		return nil, err
	}
	return openapi.GetDepartment200JSONResponse(toDepartment(d)), nil
}

func (s server) ListDepartments(ctx context.Context, req openapi.ListDepartmentsRequestObject) (openapi.ListDepartmentsResponseObject, error) {
	ds, err := s.u.Organization.ListDepartments(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	return openapi.ListDepartments200JSONResponse(mapSlice(ds, toDepartment)), nil
}

func (s server) GetTeam(ctx context.Context, req openapi.GetTeamRequestObject) (openapi.GetTeamResponseObject, error) {
	t, err := s.u.Organization.GetTeam(ctx, req.TeamId)
	if err != nil {
		return nil, err
	}
	return openapi.GetTeam200JSONResponse(toTeam(t)), nil
}

func (s server) ListTeams(ctx context.Context, req openapi.ListTeamsRequestObject) (openapi.ListTeamsResponseObject, error) {
	ts, err := s.u.Organization.ListTeams(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	return openapi.ListTeams200JSONResponse(mapSlice(ts, toTeam)), nil
}

func (s server) CreateTeam(ctx context.Context, req openapi.CreateTeamRequestObject) (openapi.CreateTeamResponseObject, error) {
	t, err := s.u.Organization.CreateTeam(ctx, req.FacilityId, req.Body.Name)
	if err != nil {
		return nil, err
	}
	return openapi.CreateTeam201JSONResponse(toTeam(t)), nil
}

func (s server) GetPosition(ctx context.Context, req openapi.GetPositionRequestObject) (openapi.GetPositionResponseObject, error) {
	p, err := s.u.Organization.GetPosition(ctx, req.PositionId)
	if err != nil {
		return nil, err
	}
	return openapi.GetPosition200JSONResponse(toPosition(p)), nil
}

func (s server) ListPositions(ctx context.Context, req openapi.ListPositionsRequestObject) (openapi.ListPositionsResponseObject, error) {
	ps, err := s.u.Organization.ListPositions(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	return openapi.ListPositions200JSONResponse(mapSlice(ps, toPosition)), nil
}

func (s server) CreatePosition(ctx context.Context, req openapi.CreatePositionRequestObject) (openapi.CreatePositionResponseObject, error) {
	var policyIDs []string
	if req.Body.PolicyIds != nil {
		policyIDs = *req.Body.PolicyIds
	}
	p, err := s.u.Organization.CreatePosition(ctx, req.FacilityId, req.Body.Name, policyIDs)
	if err != nil {
		return nil, err
	}
	return openapi.CreatePosition201JSONResponse(toPosition(p)), nil
}

func (s server) GetPolicy(ctx context.Context, req openapi.GetPolicyRequestObject) (openapi.GetPolicyResponseObject, error) {
	p, err := s.u.Organization.GetPolicy(ctx, req.PolicyId)
	if err != nil {
		return nil, err
	}
	return openapi.GetPolicy200JSONResponse(toPolicy(p)), nil
}

func (s server) ListPolicies(ctx context.Context, _ openapi.ListPoliciesRequestObject) (openapi.ListPoliciesResponseObject, error) {
	ps, err := s.u.Organization.ListPolicies(ctx)
	if err != nil {
		return nil, err
	}
	return openapi.ListPolicies200JSONResponse(mapSlice(ps, toPolicy)), nil
}
