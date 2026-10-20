package handler

import (
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

type scheduleTypeResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type visitInfoResponse struct {
	ID                string                  `json:"id"`
	PatientID         string                  `json:"patient_id"`
	PatientName       string                  `json:"patient_name"`
	AssignedStaffID   string                  `json:"assigned_staff_id"`
	AssignedStaffName string                  `json:"assigned_staff_name"`
	CompanionID       *string                 `json:"companion_id"`
	CompanionName     *string                 `json:"companion_name"`
	ServiceCodeID     string                  `json:"service_code_id"`
	ServiceCode       string                  `json:"service_code"`
	VisitCategories   []visitCategoryResponse `json:"visit_categories"`
}

type cancelResponse struct {
	ID         string `json:"id"`
	ScheduleID string `json:"schedule_id"`
	Reason     string `json:"reason"`
}

type scheduleResponse struct {
	ID                  string             `json:"id"`
	FacilityID          string             `json:"facility_id"`
	ScheduleTypeID      string             `json:"schedule_type_id"`
	ScheduleType        string             `json:"schedule_type"`
	Date                civil.Date         `json:"date"`
	StartTime           civil.Time         `json:"start_time"`
	EndTime             civil.Time         `json:"end_time"`
	IsOverTimeWork      bool               `json:"is_over_time_work"`
	StaffID             string             `json:"staff_id"`
	StaffName           string             `json:"staff_name"`
	Title               *string            `json:"title"`
	Description         *string            `json:"description"`
	RecurringScheduleID *string            `json:"recurring_schedule_id"`
	VisitInfo           *visitInfoResponse `json:"visit_info"`
	Cancel              *cancelResponse    `json:"cancel"`
	CreatedAt           time.Time          `json:"created_at"`
	UpdatedAt           time.Time          `json:"updated_at"`
}

type recurringRuleResponse struct {
	Frequency   string      `json:"frequency"`
	DayOfWeek   *int        `json:"day_of_week"`
	DayOfMonth  *int        `json:"day_of_month"`
	WeekOfMonth *int        `json:"week_of_month"`
	EndDate     *civil.Date `json:"end_date"`
}

type recurringScheduleResponse struct {
	ID             string                `json:"id"`
	FacilityID     string                `json:"facility_id"`
	ScheduleTypeID string                `json:"schedule_type_id"`
	ScheduleType   string                `json:"schedule_type"`
	Date           civil.Date            `json:"date"`
	StartTime      civil.Time            `json:"start_time"`
	EndTime        civil.Time            `json:"end_time"`
	IsOverTimeWork bool                  `json:"is_over_time_work"`
	StaffID        string                `json:"staff_id"`
	StaffName      string                `json:"staff_name"`
	Title          *string               `json:"title"`
	Description    *string               `json:"description"`
	VisitInfo      *visitInfoResponse    `json:"visit_info"`
	RecurringRule  recurringRuleResponse `json:"recurring_rule"`
	ExclusionDates []civil.Date          `json:"exclusion_dates"`
	CreatedAt      time.Time             `json:"created_at"`
	UpdatedAt      time.Time             `json:"updated_at"`
}

type scheduleListResponse struct {
	Schedules          []scheduleResponse          `json:"schedules"`
	RecurringSchedules []recurringScheduleResponse `json:"recurring_schedules"`
}

func toScheduleType(t schedule.Type) scheduleTypeResponse {
	return scheduleTypeResponse{ID: t.ID, Name: string(t.Name)}
}

func toVisitInfo(v *visit.Detail) *visitInfoResponse {
	if v == nil {
		return nil
	}
	return &visitInfoResponse{
		ID:                v.ID,
		PatientID:         v.PatientID,
		PatientName:       v.PatientName,
		AssignedStaffID:   v.AssignedStaffID,
		AssignedStaffName: v.AssignedStaffName,
		CompanionID:       v.CompanionID,
		CompanionName:     v.CompanionName,
		ServiceCodeID:     v.ServiceCodeID,
		ServiceCode:       v.ServiceCode,
		VisitCategories:   mapSlice(v.Categories, toVisitCategory),
	}
}

func toCancel(c schedule.Cancel) cancelResponse {
	return cancelResponse(c)
}

func toSchedule(d schedule.Detail) scheduleResponse {
	r := scheduleResponse{
		ID:                  d.ID,
		FacilityID:          d.FacilityID,
		ScheduleTypeID:      d.TypeID,
		ScheduleType:        string(d.TypeName),
		Date:                d.Date,
		StartTime:           d.StartTime,
		EndTime:             d.EndTime,
		IsOverTimeWork:      d.IsOverTimeWork,
		StaffID:             d.StaffID,
		StaffName:           d.StaffName,
		Title:               d.Title,
		Description:         d.Description,
		RecurringScheduleID: d.RecurringScheduleID,
		VisitInfo:           toVisitInfo(d.Visit),
		CreatedAt:           d.CreatedAt,
		UpdatedAt:           d.UpdatedAt,
	}
	if d.Cancel != nil {
		c := toCancel(*d.Cancel)
		r.Cancel = &c
	}
	return r
}

func toRecurringSchedule(d schedule.RecurringDetail) recurringScheduleResponse {
	return recurringScheduleResponse{
		ID:             d.ID,
		FacilityID:     d.FacilityID,
		ScheduleTypeID: d.TypeID,
		ScheduleType:   string(d.TypeName),
		Date:           d.Date,
		StartTime:      d.StartTime,
		EndTime:        d.EndTime,
		IsOverTimeWork: d.IsOverTimeWork,
		StaffID:        d.StaffID,
		StaffName:      d.StaffName,
		Title:          d.Title,
		Description:    d.Description,
		VisitInfo:      toVisitInfo(d.Visit),
		RecurringRule: recurringRuleResponse{
			Frequency:   string(d.Rule.Frequency),
			DayOfWeek:   d.Rule.DayOfWeek,
			DayOfMonth:  d.Rule.DayOfMonth,
			WeekOfMonth: d.Rule.WeekOfMonth,
			EndDate:     d.Rule.EndDate,
		},
		ExclusionDates: d.ExclusionDates,
		CreatedAt:      d.CreatedAt,
		UpdatedAt:      d.UpdatedAt,
	}
}
