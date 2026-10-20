package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

// PatientUsecase は、利用者のハンドラが使う操作である。
type PatientUsecase interface {
	Create(ctx context.Context, in usecase.CreatePatientInput) (patient.Detail, error)
	List(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error)
}

type patientResponse struct {
	ID                string    `json:"id"`
	FacilityID        string    `json:"facility_id"`
	Name              string    `json:"name"`
	PreferredTime     string    `json:"preferred_time"`
	PreferredGender   string    `json:"preferred_gender"`
	ServiceCodeID     string    `json:"service_code_id"`
	ServiceCode       string    `json:"service_code"`
	AssignedStaffID   string    `json:"assigned_staff_id"`
	AssignedStaffName string    `json:"assigned_staff_name"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type createPatientRequest struct {
	Name            string `json:"name" binding:"required,max=255"`
	PreferredTime   string `json:"preferred_time" binding:"required"`
	PreferredGender string `json:"preferred_gender" binding:"required"`
	ServiceCodeID   string `json:"service_code_id" binding:"required,ulid"`
	AssignedStaffID string `json:"assigned_staff_id" binding:"required,ulid"`
}

func toPatient(p patient.Detail) patientResponse {
	return patientResponse{
		ID:                p.ID,
		FacilityID:        p.FacilityID,
		Name:              p.Name,
		PreferredTime:     string(p.PreferredTime),
		PreferredGender:   string(p.PreferredGender),
		ServiceCodeID:     p.ServiceCodeID,
		ServiceCode:       p.ServiceCode,
		AssignedStaffID:   p.AssignedStaffID,
		AssignedStaffName: p.AssignedStaffName,
		CreatedAt:         p.CreatedAt,
		UpdatedAt:         p.UpdatedAt,
	}
}

type patientHandler struct {
	uc  PatientUsecase
	log *slog.Logger
}

func (h patientHandler) register(r gin.IRouter) {
	r.GET("/facilities/:facility_id/patients", h.list)
	r.POST("/facilities/:facility_id/patients", h.create)
}

func (h patientHandler) list(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	sort, err := patient.ParseSort(c.Query("sort_field"), c.Query("sort_order"))
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	q := patient.ListQuery{
		Name:          optionalQuery(c, "name"),
		AssignedStaff: optionalQuery(c, "assigned_staff"),
		Sort:          sort,
	}
	if v := c.Query("preferred_time"); v != "" {
		t := patient.PreferredTime(v)
		if !t.Valid() {
			badRequest(c, "preferred_time は 午前 か 午後 です")
			return
		}
		q.PreferredTime = &t
	}
	if v := c.Query("preferred_gender"); v != "" {
		g := patient.PreferredGender(v)
		if !g.Valid() {
			badRequest(c, "preferred_gender は 男性 か 女性 です")
			return
		}
		q.PreferredGender = &g
	}
	ps, err := h.uc.List(c.Request.Context(), id, q)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ps, toPatient))
}

func (h patientHandler) create(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	var req createPatientRequest
	if !bindJSON(c, &req) {
		return
	}
	p, err := h.uc.Create(c.Request.Context(), usecase.CreatePatientInput{
		FacilityID:      id,
		Name:            req.Name,
		PreferredTime:   patient.PreferredTime(req.PreferredTime),
		PreferredGender: patient.PreferredGender(req.PreferredGender),
		ServiceCodeID:   req.ServiceCodeID,
		AssignedStaffID: req.AssignedStaffID,
	})
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toPatient(p))
}
