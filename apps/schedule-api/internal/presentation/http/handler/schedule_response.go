package handler

import (
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/presentation/http/openapi"
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

func toCancel(c schedule.Cancel) openapi.Cancel {
	return openapi.Cancel{Id: c.ID, ScheduleId: c.ScheduleID, Reason: c.Reason}
}

func toSchedule(d schedule.Detail) openapi.Schedule {
	r := openapi.Schedule{
		Id:                  d.ID,
		FacilityId:          d.FacilityID,
		ScheduleTypeId:      d.TypeID,
		ScheduleType:        openapi.ScheduleTypeName(d.TypeName),
		Date:                d.Date.String(),
		StartTime:           d.StartTime.String(),
		EndTime:             d.EndTime.String(),
		IsOverTimeWork:      d.IsOverTimeWork,
		StaffId:             d.StaffID,
		StaffName:           d.StaffName,
		Title:               d.Title,
		Description:         d.Description,
		RecurringScheduleId: d.RecurringScheduleID,
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

func toRecurringSchedule(d schedule.RecurringDetail) openapi.RecurringSchedule {
	var endDate *string
	if d.Rule.EndDate != nil {
		s := d.Rule.EndDate.String()
		endDate = &s
	}
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
		IsOverTimeWork: d.IsOverTimeWork,
		StaffId:        d.StaffID,
		StaffName:      d.StaffName,
		Title:          d.Title,
		Description:    d.Description,
		VisitInfo:      toVisitInfo(d.Visit),
		RecurringRule: openapi.RecurringRule{
			Frequency:   openapi.RecurringRuleFrequency(d.Rule.Frequency),
			DayOfWeek:   d.Rule.DayOfWeek,
			DayOfMonth:  d.Rule.DayOfMonth,
			WeekOfMonth: d.Rule.WeekOfMonth,
			EndDate:     endDate,
		},
		ExclusionDates: exclusions,
		CreatedAt:      d.CreatedAt,
		UpdatedAt:      d.UpdatedAt,
	}
}
