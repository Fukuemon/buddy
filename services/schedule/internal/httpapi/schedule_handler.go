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
		Schedules:           mapSlice(list.Schedules, toSchedule),
		RecurringSchedules:  mapSlice(list.RecurringSchedules, toRecurringSchedule),
		SourceMode:          openapi.SourceMode(list.SourceMode),
		CalendarSyncs:       mapSlice(list.CalendarSyncs, toCalendarSyncStatus),
		Cutover:             toOpenCalendarCutover(list.Cutover),
		AllDayEvents:        mapSlice(list.AllDayEvents, toAllDayEvent),
		UnlistedEventCounts: mapSlice(list.UnlistedCounts, toUnlistedEventCount),
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

// CreateRecurringSchedule は、事業所の正本のモードで、buddy_primary なら schedule の作成を、google_primary なら calendarwrite の作成を呼ぶ。
func (s server) CreateRecurringSchedule(ctx context.Context, req openapi.CreateRecurringScheduleRequestObject) (openapi.CreateRecurringScheduleResponseObject, error) {
	b := req.Body
	in, err := slotInput(openapi.SlotRequest{
		ScheduleTypeId: b.ScheduleTypeId, Date: b.Date, StartTime: b.StartTime, EndTime: b.EndTime, EndsNextDay: b.EndsNextDay, StaffId: b.StaffId,
		Title: b.Title, Description: b.Description, VisitInfo: b.VisitInfo,
	})
	if err != nil {
		return nil, err
	}
	ruleIn, err := ruleInput(b.RecurringRule)
	if err != nil {
		return nil, err
	}
	f, err := s.u.Organization.GetFacility(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	if f.SourceMode == organization.SourceGooglePrimary {
		d, err := s.u.CalendarWrites.CreateRecurring(ctx, req.FacilityId, value(b.Id), in, ruleIn)
		if err != nil {
			return nil, err
		}
		return openapi.CreateRecurringSchedule201JSONResponse(toRecurringSchedule(d)), nil
	}
	rs, err := s.u.Schedules.CreateRecurring(ctx, req.FacilityId, in, ruleIn)
	if err != nil {
		return nil, err
	}
	d, err := s.u.Schedules.GetRecurring(ctx, rs.ID)
	if err != nil {
		return nil, err
	}
	return openapi.CreateRecurringSchedule201JSONResponse(toRecurringSchedule(d)), nil
}

// ruleInput は、本文の繰り返しの規則を、操作の入力にする。
func ruleInput(rule openapi.RecurringRule) (schedule.RuleInput, error) {
	var endDate *civil.Date
	if rule.EndDate != nil {
		d, err := bodyDate(*rule.EndDate)
		if err != nil {
			return schedule.RuleInput{}, err
		}
		endDate = &d
	}
	var days []int
	if rule.DaysOfWeek != nil {
		days = *rule.DaysOfWeek
		if days == nil {
			days = []int{}
		}
	}
	var interval int
	if rule.Interval != nil {
		interval = *rule.Interval
	}
	return schedule.RuleInput{
		Frequency:   schedule.Frequency(rule.Frequency),
		DaysOfWeek:  days,
		Interval:    interval,
		DayOfWeek:   rule.DayOfWeek,
		DayOfMonth:  rule.DayOfMonth,
		WeekOfMonth: rule.WeekOfMonth,
		EndDate:     endDate,
	}, nil
}

// ChangeRecurringRule は、職員の事業所の正本のモードで、buddy_primary なら schedule の規則の変更を、google_primary なら calendarwrite の規則の変更を呼ぶ。
func (s server) ChangeRecurringRule(ctx context.Context, req openapi.ChangeRecurringRuleRequestObject) (openapi.ChangeRecurringRuleResponseObject, error) {
	b := req.Body
	ruleIn, err := ruleInput(b.RecurringRule)
	if err != nil {
		return nil, err
	}
	var effective *civil.Date
	if b.EffectiveDate != nil {
		d, err := bodyDate(*b.EffectiveDate)
		if err != nil {
			return nil, err
		}
		effective = &d
	}
	var firstWeek *civil.Date
	if b.FirstWeekDate != nil {
		d, err := bodyDate(*b.FirstWeekDate)
		if err != nil {
			return nil, err
		}
		firstWeek = &d
	}
	f, err := s.staffFacility(ctx)
	if err != nil {
		return nil, err
	}
	if f.SourceMode == organization.SourceGooglePrimary {
		d, err := s.u.CalendarWrites.ChangeRule(ctx, f.ID, req.RecurringScheduleId, value(b.Id), value(b.Etag), effective, firstWeek, ruleIn)
		if err != nil {
			return nil, err
		}
		return openapi.ChangeRecurringRule200JSONResponse(toRecurringSchedule(d)), nil
	}
	rs, err := s.u.Schedules.ChangeRule(ctx, req.RecurringScheduleId, effective, firstWeek, ruleIn)
	if err != nil {
		return nil, err
	}
	d, err := s.u.Schedules.GetRecurring(ctx, rs.ID)
	if err != nil {
		return nil, err
	}
	return openapi.ChangeRecurringRule200JSONResponse(toRecurringSchedule(d)), nil
}

// ChangeOccurrence は、職員の事業所の正本のモードで、buddy_primary なら schedule の回の置き換えを、google_primary なら calendarwrite の回の変更を呼ぶ。
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
	f, err := s.staffFacility(ctx)
	if err != nil {
		return nil, err
	}
	if f.SourceMode == organization.SourceGooglePrimary {
		d, err := s.u.CalendarWrites.ChangeOccurrence(ctx, f.ID, req.RecurringScheduleId, original, in)
		if err != nil {
			return nil, err
		}
		return openapi.ChangeOccurrence201JSONResponse(toSchedule(d)), nil
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

// CancelOccurrence は、schedule の回のキャンセルを呼ぶ。google_primary の事業所では、何も読まずに 409（google_primary）で拒む。
// google_primary の繰り返しの予定は buddy の繰り返しの予定のテーブルに行が無く、schedule に渡すと 404 になるためである。
func (s server) CancelOccurrence(ctx context.Context, req openapi.CancelOccurrenceRequestObject) (openapi.CancelOccurrenceResponseObject, error) {
	original, err := bodyDate(req.Body.OriginalDate)
	if err != nil {
		return nil, err
	}
	if err := s.requireStaffFacilityWritable(ctx); err != nil {
		return nil, err
	}
	c, err := s.u.Schedules.CancelOccurrence(ctx, req.RecurringScheduleId, original, req.Body.Reason)
	if err != nil {
		return nil, err
	}
	return openapi.CancelOccurrence201JSONResponse(toCancel(c)), nil
}

// DeleteSchedule は、schedule の削除を呼ぶ。google_primary の事業所では、何も読まずに 409（google_primary）で拒む（ADR-0040）。
// google_primary の事業所の予定の ID は Projection の ID で、schedule に渡すと 404 になるためである。
func (s server) DeleteSchedule(ctx context.Context, req openapi.DeleteScheduleRequestObject) (openapi.DeleteScheduleResponseObject, error) {
	if err := s.requireStaffFacilityWritable(ctx); err != nil {
		return nil, err
	}
	if err := s.u.Schedules.Delete(ctx, req.ScheduleId); err != nil {
		return nil, err
	}
	return openapi.DeleteSchedule204Response{}, nil
}

// DeleteOccurrence は、schedule の回の削除を呼ぶ。google_primary の事業所では、CancelOccurrence と同じく何も読まずに 409（google_primary）で拒む。
func (s server) DeleteOccurrence(ctx context.Context, req openapi.DeleteOccurrenceRequestObject) (openapi.DeleteOccurrenceResponseObject, error) {
	original, err := bodyDate(req.Body.OriginalDate)
	if err != nil {
		return nil, err
	}
	if err := s.requireStaffFacilityWritable(ctx); err != nil {
		return nil, err
	}
	if err := s.u.Schedules.DeleteOccurrence(ctx, req.RecurringScheduleId, original); err != nil {
		return nil, err
	}
	return openapi.DeleteOccurrence204Response{}, nil
}

// requireStaffFacilityWritable は、職員の事業所の予定を buddy から書けるかを確認する。
func (s server) requireStaffFacilityWritable(ctx context.Context) error {
	f, err := s.staffFacility(ctx)
	if err != nil {
		return err
	}
	return schedule.RequireWritable(f)
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
