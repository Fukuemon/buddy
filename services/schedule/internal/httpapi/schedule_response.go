package httpapi

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
)

func toScheduleType(t schedule.Type) openapi.ScheduleType {
	return openapi.ScheduleType{Id: t.ID, Name: openapi.ScheduleTypeName(t.Name)}
}

func toVisitInfo(v *visit.Detail) *openapi.VisitInfo {
	if v == nil {
		return nil
	}
	return &openapi.VisitInfo{
		Id:                v.ID,
		PatientId:         v.PatientID,
		PatientName:       v.PatientName,
		AssignedStaffId:   v.AssignedStaffID,
		AssignedStaffName: v.AssignedStaffName,
		CompanionId:       v.CompanionID,
		CompanionName:     v.CompanionName,
		ServiceCodeId:     v.ServiceCodeID,
		ServiceCode:       v.ServiceCode,
		VisitCategories:   mapSlice(v.Categories, toVisitCategory),
	}
}

func toCancel(c schedule.Cancellation) openapi.Cancel {
	return openapi.Cancel{Id: c.ID, ScheduleId: c.ScheduleID, Reason: c.Reason}
}

func toSchedule(d scheduleview.Detail) openapi.Schedule {
	r := openapi.Schedule{
		Id:                  d.ID,
		FacilityId:          d.FacilityID,
		ScheduleTypeId:      d.TypeID,
		ScheduleType:        openapi.ScheduleTypeName(d.TypeName),
		Date:                d.Date.String(),
		StartTime:           d.StartTime.String(),
		EndTime:             d.EndTime.String(),
		EndsNextDay:         d.EndsNextDay,
		IsOverTimeWork:      d.IsOverTimeWork,
		StaffId:             d.StaffID,
		StaffName:           d.StaffName,
		Title:               d.Title,
		Description:         d.Description,
		RecurringScheduleId: d.RecurringScheduleID,
		VisitInfo:           toVisitInfo(d.Visit),
		Source:              openapi.Buddy,
		CreatedAt:           d.CreatedAt,
		UpdatedAt:           d.UpdatedAt,
	}
	if d.Cancel != nil {
		c := toCancel(*d.Cancel)
		r.Cancel = &c
	}
	if d.Source == scheduleview.SourceGoogleCalendar {
		r.Source = openapi.GoogleCalendar
	}
	if d.ReviewReason != "" {
		reason := openapi.ScheduleReviewReason(d.ReviewReason)
		r.ReviewReason = &reason
	}
	if d.ETag != "" {
		etag := d.ETag
		r.Etag = &etag
	}
	return r
}

func toCalendarSyncStatus(c scheduleview.CalendarSync) openapi.CalendarSyncStatus {
	r := openapi.CalendarSyncStatus{
		ExternalCalendarId: c.ExternalCalendarID, StaffId: c.StaffID, StaffName: c.StaffName,
		LastStatus: openapi.CalendarSyncStatusLastStatus(c.LastStatus), LastSucceededAt: c.LastSucceededAt,
	}
	if c.LastError != nil {
		code := openapi.CalendarSyncStatusLastError(*c.LastError)
		r.LastError = &code
	}
	return r
}

func toRecurringRule(r schedule.Rule) openapi.RecurringRule {
	return openapi.RecurringRule{
		Frequency:   openapi.RecurringRuleFrequency(r.Frequency),
		DayOfWeek:   r.DayOfWeek,
		DayOfMonth:  r.DayOfMonth,
		WeekOfMonth: r.WeekOfMonth,
		EndDate:     stringPtr(r.EndDate),
	}
}

func toRecurringSchedule(d scheduleview.RecurringDetail) openapi.RecurringSchedule {
	var exclusions []string
	if d.ExclusionDates != nil {
		exclusions = mapSlice(d.ExclusionDates, civil.Date.String)
	}
	return openapi.RecurringSchedule{
		Id:             d.ID,
		FacilityId:     d.FacilityID,
		ScheduleTypeId: d.TypeID,
		ScheduleType:   openapi.ScheduleTypeName(d.TypeName),
		Date:           d.Date.String(),
		StartTime:      d.StartTime.String(),
		EndTime:        d.EndTime.String(),
		EndsNextDay:    d.EndsNextDay,
		IsOverTimeWork: d.IsOverTimeWork,
		StaffId:        d.StaffID,
		StaffName:      d.StaffName,
		Title:          d.Title,
		Description:    d.Description,
		VisitInfo:      toVisitInfo(d.Visit),
		RecurringRule:  toRecurringRule(d.Rule),
		ExclusionDates: exclusions,
		CreatedAt:      d.CreatedAt,
		UpdatedAt:      d.UpdatedAt,
	}
}

func toOpenCalendarCutover(c *scheduleview.OpenCutover) *openapi.OpenCalendarCutover {
	if c == nil {
		return nil
	}
	return &openapi.OpenCalendarCutover{StartedAt: c.StartedAt, RangeStart: c.RangeStart.String()}
}
