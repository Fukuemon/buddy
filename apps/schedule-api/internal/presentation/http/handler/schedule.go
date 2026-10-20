package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/usecase"
)

// ScheduleUsecase は、予定のハンドラが使う操作である。
type ScheduleUsecase interface {
	ListTypes(ctx context.Context) ([]schedule.Type, error)
	Get(ctx context.Context, id string) (schedule.Detail, error)
	GetRecurring(ctx context.Context, id string) (schedule.RecurringDetail, error)
	List(ctx context.Context, facilityID string, q schedule.ListQuery) (usecase.List, error)
	Create(ctx context.Context, facilityID string, in usecase.SlotInput) (schedule.Detail, error)
	CreateRecurring(ctx context.Context, facilityID string, in usecase.SlotInput, rule usecase.RuleInput) (schedule.RecurringDetail, error)
	ChangeOccurrence(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in usecase.SlotInput) (schedule.Detail, error)
	Cancel(ctx context.Context, scheduleID, reason string) (schedule.Cancel, error)
}

type visitInfoRequest struct {
	PatientID        string   `json:"patient_id" binding:"required,ulid"`
	AssignedStaffID  string   `json:"assigned_staff_id" binding:"required,ulid"`
	CompanionID      *string  `json:"companion_id" binding:"omitempty,ulid"`
	ServiceCodeID    string   `json:"service_code_id" binding:"required,ulid"`
	VisitCategoryIDs []string `json:"visit_category_ids" binding:"omitempty,dive,ulid"`
}

// slotRequest は、単発と繰り返しの予定の作成に共通の本文である。
type slotRequest struct {
	ScheduleTypeID string            `json:"schedule_type_id" binding:"required,ulid"`
	Date           *civil.Date       `json:"date" binding:"required"`
	StartTime      *civil.Time       `json:"start_time" binding:"required"`
	EndTime        *civil.Time       `json:"end_time" binding:"required"`
	StaffID        string            `json:"staff_id" binding:"required,ulid"`
	Title          *string           `json:"title" binding:"omitempty,max=255"`
	Description    *string           `json:"description" binding:"omitempty,max=2000"`
	VisitInfo      *visitInfoRequest `json:"visit_info"`
}

func (r slotRequest) input() usecase.SlotInput {
	in := usecase.SlotInput{
		TypeID:      r.ScheduleTypeID,
		Date:        *r.Date,
		StartTime:   *r.StartTime,
		EndTime:     *r.EndTime,
		StaffID:     r.StaffID,
		Title:       r.Title,
		Description: r.Description,
	}
	if v := r.VisitInfo; v != nil {
		in.Visit = &usecase.VisitInput{
			PatientID:       v.PatientID,
			AssignedStaffID: v.AssignedStaffID,
			CompanionID:     v.CompanionID,
			ServiceCodeID:   v.ServiceCodeID,
			CategoryIDs:     v.VisitCategoryIDs,
		}
	}
	return in
}

type recurringRuleRequest struct {
	Frequency   string      `json:"frequency" binding:"required,oneof=weekly monthly"`
	DayOfWeek   *int        `json:"day_of_week"`
	DayOfMonth  *int        `json:"day_of_month"`
	WeekOfMonth *int        `json:"week_of_month"`
	EndDate     *civil.Date `json:"end_date"`
}

type createRecurringScheduleRequest struct {
	slotRequest
	RecurringRule *recurringRuleRequest `json:"recurring_rule" binding:"required"`
}

type changeOccurrenceRequest struct {
	slotRequest
	OriginalDate *civil.Date `json:"original_date" binding:"required"`
}

type cancelRequest struct {
	Reason string `json:"reason" binding:"required,max=255"`
}

type scheduleHandler struct {
	uc  ScheduleUsecase
	log *slog.Logger
}

func (h scheduleHandler) register(r gin.IRouter) {
	r.GET("/schedule_types", h.listTypes)
	r.GET("/facilities/:facility_id/schedules", h.list)
	r.POST("/facilities/:facility_id/schedules", h.create)
	r.POST("/facilities/:facility_id/schedules/recurring", h.createRecurring)
	r.GET("/schedules/:schedule_id", h.get)
	r.POST("/schedules/:schedule_id/cancel", h.cancel)
	r.GET("/schedules/recurring/:recurring_schedule_id", h.getRecurring)
	r.POST("/schedules/recurring/:recurring_schedule_id/occurrences", h.changeOccurrence)
}

func (h scheduleHandler) listTypes(c *gin.Context) {
	ts, err := h.uc.ListTypes(c.Request.Context())
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ts, toScheduleType))
}

func (h scheduleHandler) list(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	sort, err := schedule.ParseSort(c.Query("sort_field"), c.Query("sort_order"))
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	q := schedule.ListQuery{Sort: sort}
	if v := c.Query("schedule_type"); v != "" {
		name := schedule.TypeName(v)
		if name != schedule.Normal && name != schedule.Visit {
			badRequest(c, "schedule_type は 通常 か 訪問 です")
			return
		}
		q.TypeName = &name
	}
	if q.DateFrom, ok = dateQuery(c, "date_from"); !ok {
		return
	}
	if q.DateTo, ok = dateQuery(c, "date_to"); !ok {
		return
	}
	list, err := h.uc.List(c.Request.Context(), id, q)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, scheduleListResponse{
		Schedules:          mapSlice(list.Schedules, toSchedule),
		RecurringSchedules: mapSlice(list.RecurringSchedules, toRecurringSchedule),
	})
}

func (h scheduleHandler) get(c *gin.Context) {
	id, ok := pathID(c, "schedule_id")
	if !ok {
		return
	}
	d, err := h.uc.Get(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, toSchedule(d))
}

func (h scheduleHandler) getRecurring(c *gin.Context) {
	id, ok := pathID(c, "recurring_schedule_id")
	if !ok {
		return
	}
	d, err := h.uc.GetRecurring(c.Request.Context(), id)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, toRecurringSchedule(d))
}

func (h scheduleHandler) create(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	var req slotRequest
	if !bindJSON(c, &req) {
		return
	}
	d, err := h.uc.Create(c.Request.Context(), id, req.input())
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toSchedule(d))
}

func (h scheduleHandler) createRecurring(c *gin.Context) {
	id, ok := pathID(c, "facility_id")
	if !ok {
		return
	}
	var req createRecurringScheduleRequest
	if !bindJSON(c, &req) {
		return
	}
	rule := req.RecurringRule
	d, err := h.uc.CreateRecurring(c.Request.Context(), id, req.input(), usecase.RuleInput{
		Frequency:   schedule.Frequency(rule.Frequency),
		DayOfWeek:   rule.DayOfWeek,
		DayOfMonth:  rule.DayOfMonth,
		WeekOfMonth: rule.WeekOfMonth,
		EndDate:     rule.EndDate,
	})
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toRecurringSchedule(d))
}

func (h scheduleHandler) changeOccurrence(c *gin.Context) {
	id, ok := pathID(c, "recurring_schedule_id")
	if !ok {
		return
	}
	var req changeOccurrenceRequest
	if !bindJSON(c, &req) {
		return
	}
	d, err := h.uc.ChangeOccurrence(c.Request.Context(), id, *req.OriginalDate, req.input())
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toSchedule(d))
}

func (h scheduleHandler) cancel(c *gin.Context) {
	id, ok := pathID(c, "schedule_id")
	if !ok {
		return
	}
	var req cancelRequest
	if !bindJSON(c, &req) {
		return
	}
	cancel, err := h.uc.Cancel(c.Request.Context(), id, req.Reason)
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusCreated, toCancel(cancel))
}
