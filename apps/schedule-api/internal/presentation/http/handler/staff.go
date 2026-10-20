package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

// StaffUsecase は、職員のハンドラが使う操作である。
type StaffUsecase interface {
	Create(ctx context.Context, in usecase.CreateStaffInput) (staff.Detail, error)
	Get(ctx context.Context, id string) (staff.Detail, error)
	List(ctx context.Context, facilityID string, q staff.ListQuery) ([]staff.Summary, error)
}

type refResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type staffResponse struct {
	ID          string      `json:"id"`
	Username    string      `json:"username"`
	Email       string      `json:"email"`
	PhoneNumber *string     `json:"phone_number"`
	FacilityID  string      `json:"facility_id"`
	Department  refResponse `json:"department"`
	Team        refResponse `json:"team"`
	Position    refResponse `json:"position"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

type staffPolicyResponse struct {
	UserPolicyID  string   `json:"user_policy_id"`
	PolicyID      string   `json:"policy_id"`
	Name          string   `json:"name"`
	TargetUserIDs []string `json:"target_user_ids"`
}

type staffDetailResponse struct {
	staffResponse
	Sub      *string               `json:"sub"`
	Policies []staffPolicyResponse `json:"policies"`
}

type createStaffRequest struct {
	Username     string  `json:"username" binding:"required,max=128"`
	Email        string  `json:"email" binding:"required,email,max=320"`
	PhoneNumber  *string `json:"phone_number" binding:"omitempty,max=12"`
	DepartmentID string  `json:"department_id" binding:"required,ulid"`
	TeamID       string  `json:"team_id" binding:"required,ulid"`
	PositionID   string  `json:"position_id" binding:"required,ulid"`
}

func toStaff(s staff.Summary) staffResponse {
	return staffResponse{
		ID:          s.ID,
		Username:    s.Username,
		Email:       s.Email,
		PhoneNumber: s.PhoneNumber,
		FacilityID:  s.FacilityID,
		Department:  refResponse{ID: s.DepartmentID, Name: s.DepartmentName},
		Team:        refResponse{ID: s.TeamID, Name: s.TeamName},
		Position:    refResponse{ID: s.PositionID, Name: s.PositionName},
		CreatedAt:   s.CreatedAt,
		UpdatedAt:   s.UpdatedAt,
	}
}

func toStaffDetail(d staff.Detail) staffDetailResponse {
	return staffDetailResponse{
		staffResponse: toStaff(d.Summary),
		Sub:           d.Sub,
		Policies: mapSlice(d.Policies, func(p staff.PolicyGrant) staffPolicyResponse {
			return staffPolicyResponse{
				UserPolicyID: p.UserPolicyID, PolicyID: p.PolicyID, Name: p.PolicyName, TargetUserIDs: p.TargetUserIDs,
			}
		}),
	}
}

type staffHandler struct {
	uc  StaffUsecase
	log *slog.Logger
}

func (h staffHandler) register(r gin.IRouter) {
	r.GET("/facilities/:facility_id/users", h.list)
	r.POST("/facilities/:facility_id/users", h.create)
	r.GET("/users/:user_id", h.get)
}

func (h staffHandler) get(c *gin.Context) {
	id, ok := pathID(c, "user_id")
	if !ok {
		return
	}
	d, err := h.uc.Get(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, toStaffDetail(d))
}

func (h staffHandler) list(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	sort, err := staff.ParseSort(c.Query("sort_field"), c.Query("sort_order"))
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	ss, err := h.uc.List(c.Request.Context(), id, staff.ListQuery{
		Username:   optionalQuery(c, "username"),
		Position:   optionalQuery(c, "position"),
		Department: optionalQuery(c, "department"),
		Team:       optionalQuery(c, "team"),
		Sort:       sort,
	})
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ss, toStaff))
}

func (h staffHandler) create(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	var req createStaffRequest
	if !bindJSON(c, &req) {
		return
	}
	d, err := h.uc.Create(c.Request.Context(), usecase.CreateStaffInput{
		FacilityID:   id,
		Username:     req.Username,
		Email:        req.Email,
		PhoneNumber:  req.PhoneNumber,
		DepartmentID: req.DepartmentID,
		TeamID:       req.TeamID,
		PositionID:   req.PositionID,
	})
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toStaffDetail(d))
}
