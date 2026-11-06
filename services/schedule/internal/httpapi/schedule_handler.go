package httpapi

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// slotInput は、検証した本文の予定の枠を schedule.SlotInput に変える。日付と時刻の形が誤っていれば 400 になるエラーを返す。
func slotInput(r openapi.SlotRequest) (schedule.SlotInput, error) {
	date, err := bodyDate(r.Date)
	if err != nil {
		return schedule.SlotInput{}, err
	}
	start, err := bodyTime(r.StartTime)
	if err != nil {
		return schedule.SlotInput{}, err
	}
	end, err := bodyTime(r.EndTime)
	if err != nil {
		return schedule.SlotInput{}, err
	}
	in := schedule.SlotInput{
		TypeID:      r.ScheduleTypeId,
		Date:        date,
		StartTime:   start,
		EndTime:     end,
		EndsNextDay: r.EndsNextDay != nil && *r.EndsNextDay,
		StaffID:     r.StaffId,
		Title:       r.Title,
		Description: r.Description,
	}
	if v := r.VisitInfo; v != nil {
		in.Visit = &visit.Input{
			PatientID:       v.PatientId,
			AssignedStaffID: v.AssignedStaffId,
			CompanionID:     v.CompanionId,
			ServiceCodeID:   v.ServiceCodeId,
		}
		if v.VisitCategoryIds != nil {
			in.Visit.CategoryIDs = *v.VisitCategoryIds
		}
	}
	return in, nil
}

func (s server) ListScheduleTypes(ctx context.Context, _ openapi.ListScheduleTypesRequestObject) (openapi.ListScheduleTypesResponseObject, error) {
	ts, err := s.u.Schedules.ListTypes(ctx)
	if err != nil {
		return nil, err
	}
	return openapi.ListScheduleTypes200JSONResponse(mapSlice(ts, toScheduleType)), nil
}

func (s server) ListSchedules(ctx context.Context, req openapi.ListSchedulesRequestObject) (openapi.ListSchedulesResponseObject, error) {
	p := req.Params
	sort, err := scheduleview.ParseSort(value(p.SortField), value(p.SortOrder))
	if err != nil {
		return nil, err
	}
	q := scheduleview.ListQuery{Sort: sort}
	if v := value(p.ScheduleType); v != "" {
		name := schedule.TypeName(v)
		if name != schedule.Normal && name != schedule.Visit {
			return nil, invalidRequest("schedule_type は 通常 か 訪問 です")
		}
		q.TypeName = &name
	}
	if q.DateFrom, err = dateQuery("date_from", p.DateFrom); err != nil {
		return nil, err
	}
	if q.DateTo, err = dateQuery("date_to", p.DateTo); err != nil {
		return nil, err
	}
	list, err := s.u.Schedules.List(ctx, req.FacilityId, q)
	if err != nil {
		return nil, err
	}
	return openapi.ListSchedules200JSONResponse{
		Schedules:          mapSlice(list.Schedules, toSchedule),
		RecurringSchedules: mapSlice(list.RecurringSchedules, toRecurringSchedule),
		SourceMode:         openapi.SourceMode(list.SourceMode),
		CalendarSyncs:      mapSlice(list.CalendarSyncs, toCalendarSyncStatus),
		Cutover:            toOpenCalendarCutover(list.Cutover),
	}, nil
}

// GetSchedule は、職員の事業所の正本のモードで、buddy_primary なら buddy の予定を、google_primary なら Projection の予定を返す。
func (s server) GetSchedule(ctx context.Context, req openapi.GetScheduleRequestObject) (openapi.GetScheduleResponseObject, error) {
	f, err := s.staffFacility(ctx)
	if err != nil {
		return nil, err
	}
	if f.SourceMode == organization.SourceGooglePrimary {
		d, err := s.u.Schedules.GetProjected(ctx, f.ID, req.ScheduleId)
		if err != nil {
			return nil, err
		}
		return openapi.GetSchedule200JSONResponse(toSchedule(d)), nil
	}
	d, err := s.u.Schedules.Get(ctx, req.ScheduleId)
	if err != nil {
		return nil, err
	}
	return openapi.GetSchedule200JSONResponse(toSchedule(d)), nil
}

func (s server) GetRecurringSchedule(ctx context.Context, req openapi.GetRecurringScheduleRequestObject) (openapi.GetRecurringScheduleResponseObject, error) {
	d, err := s.u.Schedules.GetRecurring(ctx, req.RecurringScheduleId)
	if err != nil {
		return nil, err
	}
	return openapi.GetRecurringSchedule200JSONResponse(toRecurringSchedule(d)), nil
}

// CreateSchedule は、事業所の正本のモードで、buddy_primary なら schedule の作成を、google_primary なら calendarwrite の作成を呼ぶ。
func (s server) CreateSchedule(ctx context.Context, req openapi.CreateScheduleRequestObject) (openapi.CreateScheduleResponseObject, error) {
	b := req.Body
	in, err := slotInput(openapi.SlotRequest{
		ScheduleTypeId: b.ScheduleTypeId, Date: b.Date, StartTime: b.StartTime, EndTime: b.EndTime, EndsNextDay: b.EndsNextDay, StaffId: b.StaffId,
		Title: b.Title, Description: b.Description, VisitInfo: b.VisitInfo,
	})
	if err != nil {
		return nil, err
	}
	f, err := s.u.Organization.GetFacility(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	if f.SourceMode == organization.SourceGooglePrimary {
		d, err := s.u.CalendarWrites.Create(ctx, req.FacilityId, value(b.Id), in)
		if err != nil {
			return nil, err
		}
		return openapi.CreateSchedule201JSONResponse(toSchedule(d)), nil
	}
	in.ID = value(b.Id)
	sc, err := s.u.Schedules.Create(ctx, req.FacilityId, in)
	if err != nil {
		return nil, err
	}
	d, err := s.u.Schedules.Get(ctx, sc.ID)
	if err != nil {
		return nil, err
	}
	return openapi.CreateSchedule201JSONResponse(toSchedule(d)), nil
}

func (s server) CreateRecurringSchedule(ctx context.Context, req openapi.CreateRecurringScheduleRequestObject) (openapi.CreateRecurringScheduleResponseObject, error) {
	b := req.Body
	in, err := slotInput(openapi.SlotRequest{
		ScheduleTypeId: b.ScheduleTypeId, Date: b.Date, StartTime: b.StartTime, EndTime: b.EndTime, EndsNextDay: b.EndsNextDay, StaffId: b.StaffId,
		Title: b.Title, Description: b.Description, VisitInfo: b.VisitInfo,
	})
	if err != nil {
		return nil, err
	}
	rule := b.RecurringRule
	var endDate *civil.Date
	if rule.EndDate != nil {
		d, err := bodyDate(*rule.EndDate)
		if err != nil {
			return nil, err
		}
		endDate = &d
	}
	rs, err := s.u.Schedules.CreateRecurring(ctx, req.FacilityId, in, schedule.RuleInput{
		Frequency:   schedule.Frequency(rule.Frequency),
		DayOfWeek:   rule.DayOfWeek,
		DayOfMonth:  rule.DayOfMonth,
		WeekOfMonth: rule.WeekOfMonth,
		EndDate:     endDate,
	})
	if err != nil {
		return nil, err
	}
	d, err := s.u.Schedules.GetRecurring(ctx, rs.ID)
	if err != nil {
		return nil, err
	}
	return openapi.CreateRecurringSchedule201JSONResponse(toRecurringSchedule(d)), nil
}

func (s server) ChangeOccurrence(ctx context.Context, req openapi.ChangeOccurrenceRequestObject) (openapi.ChangeOccurrenceResponseObject, error) {
	b := req.Body
	in, err := slotInput(openapi.SlotRequest{
		ScheduleTypeId: b.ScheduleTypeId, Date: b.Date, StartTime: b.StartTime, EndTime: b.EndTime, EndsNextDay: b.EndsNextDay, StaffId: b.StaffId,
		Title: b.Title, Description: b.Description, VisitInfo: b.VisitInfo,
	})
	if err != nil {
		return nil, err
	}
	original, err := bodyDate(b.OriginalDate)
	if err != nil {
		return nil, err
	}
	sc, err := s.u.Schedules.ChangeOccurrence(ctx, req.RecurringScheduleId, original, in)
	if err != nil {
		return nil, err
	}
	d, err := s.u.Schedules.Get(ctx, sc.ID)
	if err != nil {
		return nil, err
	}
	return openapi.ChangeOccurrence201JSONResponse(toSchedule(d)), nil
}

// UpdateSchedule は、職員の事業所の正本のモードで、buddy_primary なら schedule の変更を、google_primary なら calendarwrite の変更を呼ぶ。
func (s server) UpdateSchedule(ctx context.Context, req openapi.UpdateScheduleRequestObject) (openapi.UpdateScheduleResponseObject, error) {
	b := req.Body
	in, err := slotInput(openapi.SlotRequest{
		ScheduleTypeId: b.ScheduleTypeId, Date: b.Date, StartTime: b.StartTime, EndTime: b.EndTime, EndsNextDay: b.EndsNextDay, StaffId: b.StaffId,
		Title: b.Title, Description: b.Description, VisitInfo: b.VisitInfo,
	})
	if err != nil {
		return nil, err
	}
	f, err := s.staffFacility(ctx)
	if err != nil {
		return nil, err
	}
	if f.SourceMode == organization.SourceGooglePrimary {
		d, err := s.u.CalendarWrites.Update(ctx, f.ID, req.ScheduleId, value(b.Etag), in)
		if err != nil {
			return nil, err
		}
		return openapi.UpdateSchedule200JSONResponse(toSchedule(d)), nil
	}
	sc, err := s.u.Schedules.Update(ctx, req.ScheduleId, in)
	if err != nil {
		return nil, err
	}
	d, err := s.u.Schedules.Get(ctx, sc.ID)
	if err != nil {
		return nil, err
	}
	return openapi.UpdateSchedule200JSONResponse(toSchedule(d)), nil
}

// CancelSchedule は、職員の事業所の正本のモードで、buddy_primary なら schedule のキャンセルを、google_primary なら calendarwrite の取り消しを呼ぶ。
func (s server) CancelSchedule(ctx context.Context, req openapi.CancelScheduleRequestObject) (openapi.CancelScheduleResponseObject, error) {
	f, err := s.staffFacility(ctx)
	if err != nil {
		return nil, err
	}
	if f.SourceMode == organization.SourceGooglePrimary {
		c, err := s.u.CalendarWrites.Cancel(ctx, f.ID, req.ScheduleId, value(req.Body.Etag), req.Body.Reason)
		if err != nil {
			return nil, err
		}
		return openapi.CancelSchedule201JSONResponse(toCancel(c)), nil
	}
	c, err := s.u.Schedules.Cancel(ctx, req.ScheduleId, req.Body.Reason)
	if err != nil {
		return nil, err
	}
	return openapi.CancelSchedule201JSONResponse(toCancel(c)), nil
}

// staffFacility は、認証のミドルウェアが特定した職員の事業所を返す。パスに事業所の無い予定の操作が、正本のモードを読むのに使う。
// パスの予定が見つかれば、ミドルウェアが予定の事業所と職員の事業所が同じことを確認している。見つからない予定は、職員の事業所の中で探す。
func (s server) staffFacility(ctx context.Context) (organization.Facility, error) {
	p, ok := principal.From(ctx)
	if !ok {
		return organization.Facility{}, errors.New("認証のミドルウェアを通らずに予定の操作を呼びました")
	}
	return s.u.Organization.GetFacility(ctx, p.Staff.FacilityID)
}
