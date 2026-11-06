package calendarwrite

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// beginOccurrence は、繰り返しの予定の 1 回（Google の回の予定）を in の内容に変える書き込みを、1 つ目のトランザクションの中で組み立てる。
// id は回の一覧での ID で、rec はその記録（無ければ nil）である。cal と eventID は回の予定の場所で、etag は If-Match に付ける値である。
// staffID はカレンダーの職員で、current は回の今の訪問の情報（回の記録か、親の予定の記録の確定した版）で無ければ nil である。
//
// 訪問の情報は親の予定の記録に持ち、回で訪問の情報を変えたときだけ回の記録を足す（ADR-0026）。回の記録があれば版を 1 つ進めた保留の版を書き、
// 記録が無く訪問の情報を変えるときは、確定した版を 0 にした記録を作る。記録が無く訪問の情報を変えないときは、記録も保留の版も書かず、
// 入力から作った訪問の情報を消す。予定の職員を替える入力は errOccurrenceMove で拒む。
func (u Update) beginOccurrence(ctx context.Context, facilityID, id string, rec *calendar.EventRecord, cal calendar.ExternalCalendar,
	eventID, etag, staffID string, current *visit.Detail, in schedule.SlotInput) (change, error) {
	var currentID *string
	if current != nil {
		currentID = &current.ID
	}
	kept, err := visitInfoOf(ctx, u.details, currentID)
	if err != nil {
		return change{}, err
	}
	sc, typ, err := schedule.PrepareChange(ctx, u.types, u.staffRefs, u.visits, u.now, facilityID, id, in, staffID, kept)
	if err != nil {
		return change{}, err
	}
	if sc.StaffID != staffID {
		if err := deleteVisit(ctx, u.visits, sc.VisitInfoID); err != nil {
			return change{}, err
		}
		return change{}, errOccurrenceMove
	}
	c := change{scheduleID: id, from: cal, fromEventID: eventID, to: cal, toEventID: eventID, etag: etag}
	if c.detail, err = describe(ctx, u.staffNames, u.details, sc, typ); err != nil {
		return change{}, err
	}
	pending := &calendar.PendingWrite{Version: 1, State: calendar.PendingWriting, VisitInfoID: sc.VisitInfoID, Deadline: u.now().Add(WriteDeadline)}
	switch {
	case rec != nil:
		pending.Version = rec.Version + 1
		rec.Pending = pending
		err = u.records.Update(ctx, *rec)
	case !sameVisit(in.Visit, current):
		err = u.records.Create(ctx, calendar.EventRecord{
			ScheduleID: id, FacilityID: facilityID, ExternalCalendarID: cal.ID, ExternalEventID: eventID, Pending: pending,
		})
		if errors.Is(err, apperr.ErrConflict) {
			err = errWritePending
		}
	default:
		if err := deleteVisit(ctx, u.visits, sc.VisitInfoID); err != nil {
			return change{}, err
		}
		if err := useStoredVisit(ctx, u.details, &c.detail, currentID); err != nil {
			return change{}, err
		}
		c.body = calendar.ScheduleBody(c.detail)
		return c, nil
	}
	if err != nil {
		return change{}, err
	}
	c.version = pending.Version
	c.body = bodyOf(c.detail, c.version)
	return c, nil
}

// sameVisit は、入力の訪問の情報 in が、今の訪問の情報 cur と同じ利用者、主訪問者、同行者、サービスコード、区分かを返す。
// どちらも無ければ true を返す。
func sameVisit(in *visit.Input, cur *visit.Detail) bool {
	if in == nil || cur == nil {
		return in == nil && cur == nil
	}
	if in.PatientID != cur.PatientID || in.AssignedStaffID != cur.AssignedStaffID || in.ServiceCodeID != cur.ServiceCodeID ||
		!equalPtr(in.CompanionID, cur.CompanionID) {
		return false
	}
	ids := make([]string, len(cur.Categories))
	for i, c := range cur.Categories {
		ids[i] = c.ID
	}
	want := slices.Clone(in.CategoryIDs)
	slices.Sort(ids)
	slices.Sort(want)
	return slices.Equal(ids, want)
}

func equalPtr(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// parentEvent は、繰り返しの予定の親の Projection の行と、行のカレンダーである。
type parentEvent struct {
	row scheduleview.ProjectionDetail
	cal calendar.ExternalCalendar
}

// lockParent は、事業所 facilityID の、一覧での ID が id の繰り返しの予定の親を読み、ctx の職員が予定を編集できることを確認する。
// 親の記録があれば排他のロックで読む。トランザクションの中で呼ぶ。
// 親が無いか、親でない予定か、記録がほかの事業所のものなら apperr.ErrNotFound を、記録に保留の版があれば errWritePending を、
// Google で取り消した親には errEventNotFound を返す。権限のエラーは schedule.RequireScheduleAccess と同じである。
func lockParent(ctx context.Context, records RecordRepository, projections Projections, staffRefs kernel.Finder[staff.Ref], calendars Calendars,
	facilityID, id string) (parentEvent, error) {
	r, err := records.GetForUpdate(ctx, id)
	switch {
	case err == nil:
		if r.FacilityID != facilityID {
			return parentEvent{}, apperr.ErrNotFound
		}
		if r.Pending != nil {
			return parentEvent{}, errWritePending
		}
	case !errors.Is(err, apperr.ErrNotFound):
		return parentEvent{}, err
	}
	row, err := projections.GetBySchedule(ctx, facilityID, id)
	if err != nil {
		return parentEvent{}, err
	}
	switch {
	case !row.IsParent():
		return parentEvent{}, apperr.ErrNotFound
	case row.Status != scheduleview.ProjectionConfirmed:
		return parentEvent{}, errEventNotFound
	}
	if err := schedule.RequireScheduleAccess(ctx, staffRefs, row.StaffID, true); err != nil {
		return parentEvent{}, err
	}
	cal, err := calendars.Get(ctx, row.ExternalCalendarID)
	if err != nil {
		return parentEvent{}, err
	}
	return parentEvent{row: row, cal: cal}, nil
}

// requireUnchanged は、Google の回の予定 eventID を、事業所 facilityID でまだ buddy から変えていないことを確認する。
// 回の一覧での ID の記録か、例外の回の Projection の行があれば、errReplaced を返す。記録に保留の版があれば errWritePending を返す。
// 同じ日を 2 回置き換えない buddy_primary の繰り返しの予定の規則に合わせる。トランザクションの中で呼ぶ。
func requireUnchanged(ctx context.Context, records RecordRepository, projections Projections, facilityID string, cal calendar.ExternalCalendar, eventID string) error {
	id := scheduleview.ProjectedScheduleID(cal.ID, eventID)
	r, err := records.GetForUpdate(ctx, id)
	switch {
	case err == nil && r.Pending != nil:
		return errWritePending
	case err == nil:
		return errReplaced
	case !errors.Is(err, apperr.ErrNotFound):
		return err
	}
	row, err := projections.GetBySchedule(ctx, facilityID, id)
	switch {
	case err == nil && row.IsException():
		return errReplaced
	case err != nil && !errors.Is(err, apperr.ErrNotFound):
		return err
	}
	return nil
}

// findInstance は、カレンダー cal の繰り返しの予定 parentEventID の、元の規則で d に始まる回を、events.instances で Google から読む。
// 前後の日に動かした例外の回も見つけるため、d の前の日から後の日までの回を読む。
// 読めなければ ErrGoogleUnavailable を包んだエラーを、回が無ければ入力のエラーを返す。
func findInstance(ctx context.Context, source calendar.EventSource, cal calendar.ExternalCalendar, parentEventID string, d civil.Date) (calendar.Event, error) {
	from := time.Date(d.Year, d.Month, d.Day-1, 0, 0, 0, 0, calendar.Tokyo)
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	defer cancel()
	events, err := source.Instances(callCtx, cal.CalendarID, parentEventID, from, from.AddDate(0, 0, 3))
	if err != nil {
		return calendar.Event{}, fmt.Errorf("%w: %w", ErrGoogleUnavailable, err)
	}
	for _, ev := range events {
		if day, ok := calendar.OriginalDate(ev); ok && day == d {
			return ev, nil
		}
	}
	return calendar.Event{}, apperr.Invalid("%s は繰り返しの予定の回に当たりません", d)
}
