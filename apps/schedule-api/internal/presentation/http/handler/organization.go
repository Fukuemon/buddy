package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
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
	CreatePolicy(ctx context.Context, name string) (organization.Policy, error)
}

type facilityResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// unitResponse は、部署とチームのレスポンスである。
type unitResponse struct {
	ID         string    `json:"id"`
	FacilityID string    `json:"facility_id"`
	Name       string    `json:"name"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type policyResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type positionResponse struct {
	ID         string           `json:"id"`
	FacilityID string           `json:"facility_id"`
	Name       string           `json:"name"`
	Policies   []policyResponse `json:"policies"`
	CreatedAt  time.Time        `json:"created_at"`
	UpdatedAt  time.Time        `json:"updated_at"`
}

type createNameRequest struct {
	Name string `json:"name" binding:"required,max=255"`
}

type createPositionRequest struct {
	Name      string   `json:"name" binding:"required,max=255"`
	PolicyIDs []string `json:"policy_ids" binding:"omitempty,dive,ulid"`
}

func toDepartment(d organization.Department) unitResponse {
	return unitResponse{ID: d.ID, FacilityID: d.FacilityID, Name: d.Name, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt}
}

func toTeam(t organization.Team) unitResponse {
	return unitResponse{ID: t.ID, FacilityID: t.FacilityID, Name: t.Name, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt}
}

func toPolicy(p organization.Policy) policyResponse {
	return policyResponse{ID: p.ID, Name: p.Name, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt}
}

func toPosition(p organization.Position) positionResponse {
	return positionResponse{
		ID: p.ID, FacilityID: p.FacilityID, Name: p.Name, Policies: mapSlice(p.Policies, toPolicy),
		CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}

func mapSlice[T, U any](in []T, f func(T) U) []U {
	out := make([]U, len(in))
	for i, v := range in {
		out[i] = f(v)
	}
	return out
}

type organizationHandler struct {
	uc  OrganizationUsecase
	log *slog.Logger
}

func (h organizationHandler) register(r gin.IRouter) {
	r.GET("/facilities/:facility_id", h.getFacility)
	r.GET("/facilities/:facility_id/departments", h.listDepartments)
	r.GET("/departments/:department_id", h.getDepartment)
	r.GET("/facilities/:facility_id/teams", h.listTeams)
	r.POST("/facilities/:facility_id/teams", h.createTeam)
	r.GET("/teams/:team_id", h.getTeam)
	r.GET("/facilities/:facility_id/positions", h.listPositions)
	r.POST("/facilities/:facility_id/positions", h.createPosition)
	r.GET("/positions/:position_id", h.getPosition)
	r.GET("/policies", h.listPolicies)
	r.POST("/policies", h.createPolicy)
	r.GET("/policies/:policy_id", h.getPolicy)
}

func (h organizationHandler) getFacility(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	f, err := h.uc.GetFacility(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, facilityResponse(f))
}

func (h organizationHandler) getDepartment(c *gin.Context) {
	id, ok := pathID(c, "department_id")
	if !ok {
		return
	}
	d, err := h.uc.GetDepartment(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, toDepartment(d))
}

func (h organizationHandler) listDepartments(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	ds, err := h.uc.ListDepartments(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ds, toDepartment))
}

func (h organizationHandler) getTeam(c *gin.Context) {
	id, ok := pathID(c, "team_id")
	if !ok {
		return
	}
	t, err := h.uc.GetTeam(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, toTeam(t))
}

func (h organizationHandler) listTeams(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	ts, err := h.uc.ListTeams(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ts, toTeam))
}

func (h organizationHandler) createTeam(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	var req createNameRequest
	if !bindJSON(c, &req) {
		return
	}
	t, err := h.uc.CreateTeam(c.Request.Context(), id, req.Name)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toTeam(t))
}

func (h organizationHandler) getPosition(c *gin.Context) {
	id, ok := pathID(c, "position_id")
	if !ok {
		return
	}
	p, err := h.uc.GetPosition(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, toPosition(p))
}

func (h organizationHandler) listPositions(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	ps, err := h.uc.ListPositions(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ps, toPosition))
}

func (h organizationHandler) createPosition(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	var req createPositionRequest
	if !bindJSON(c, &req) {
		return
	}
	p, err := h.uc.CreatePosition(c.Request.Context(), id, req.Name, req.PolicyIDs)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toPosition(p))
}

func (h organizationHandler) getPolicy(c *gin.Context) {
	id, ok := pathID(c, "policy_id")
	if !ok {
		return
	}
	p, err := h.uc.GetPolicy(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, toPolicy(p))
}

func (h organizationHandler) listPolicies(c *gin.Context) {
	ps, err := h.uc.ListPolicies(c.Request.Context())
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ps, toPolicy))
}

func (h organizationHandler) createPolicy(c *gin.Context) {
	var req createNameRequest
	if !bindJSON(c, &req) {
		return
	}
	p, err := h.uc.CreatePolicy(c.Request.Context(), req.Name)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toPolicy(p))
}
