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
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// beginOccurrence は、繰り返しの予定の 1 回（Google の回の予定）を in の内容に変える書き込みを、1 つ目のトランザクションの中で組み立てる。
// id は回の一覧での ID で、rec はその記録（無ければ nil）である。cal と eventID は回の予定の場所で、etag は If-Match に付ける値である。
// staffID はカレンダーの職員で、current は回の今の訪問の情報（回の記録か、親の予定の記録の確定した版）で無ければ nil である。
//
// 訪問の情報は親の予定の記録に持ち、回で訪問の情報を変えたときだけ回の記録を足す（ADR-0028）。回の記録があれば版を 1 つ進めた保留の版を書き、
// 記録が無く訪問の情報を変えるときは、確定した版を 0 にした記録を作る。記録が無く訪問の情報を変えないときは、記録も保留の版も書かず、
// 入力から作った訪問の情報を消す。
// 予定の職員を替えると、元のカレンダーの回を取り消し、新しい職員のカレンダーに新しい ID の単発の予定を作る書き込みにする（Update.move）。
// 移す先は保留の版に持ち、記録が無ければ訪問の情報によらず記録を作る。移した単発の予定の一覧での ID を、記録の主キー（回の一覧での ID）にするためである。
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
	c := change{scheduleID: id, from: cal, fromEventID: eventID, to: cal, toEventID: eventID, etag: etag}
	if sc.StaffID != staffID {
		to, err := u.calendars.ActiveByStaff(ctx, sc.StaffID)
		if errors.Is(err, apperr.ErrNotFound) {
			return change{}, errCalendarNotLinked
		}
		if err != nil {
			return change{}, err
		}
		// 移す先には新しい ID の単発の予定を作る。単発の予定を移すときと同じく、消した予定の ID での作成を Google が 409 で拒むためである。
		// 出典: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
		if c.toEventID, err = calendar.EventIDOf(u.ids.NewID()); err != nil {
			return change{}, err
		}
		c.to = to
	}
	if c.detail, err = describe(ctx, u.staffNames, u.details, sc, typ); err != nil {
		return change{}, err
	}
	pending := &calendar.PendingWrite{Version: 1, State: calendar.PendingWriting, VisitInfoID: sc.VisitInfoID, Deadline: u.now().Add(WriteDeadline)}
	if c.moving() {
		pending.MoveTo = &calendar.EventLocation{ExternalCalendarID: c.to.ID, ExternalEventID: c.toEventID}
	}
	switch {
	case rec != nil:
		pending.Version = rec.Version + 1
		rec.Pending = pending
		err = u.records.Update(ctx, *rec)
	case c.moving() || !sameVisit(in.Visit, current):
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

// requireUnchanged は、一覧での ID が id の回を、事業所 facilityID でまだ変えていないことを確認する。
// 回の記録か、回の例外の回の Projection の行があれば、errReplaced を返す。記録に保留の版があれば errWritePending を返す。
// 同じ日を 2 回置き換えない buddy_primary の繰り返しの予定の規則に合わせる。トランザクションの中で呼ぶ。
func requireUnchanged(ctx context.Context, records RecordRepository, projections Projections, facilityID, id string) error {
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

// requireParentSettled は、カレンダー cal の繰り返しの予定 parentEventID の記録に保留の版が無いことを確認する。記録を排他のロックで読み、
// 保留の版があれば errWritePending を返す。例外の回の変更と取り消しが、親の予定の書き込みが終わるまで回に書かないために使う。
// トランザクションの中で呼ぶ。
func requireParentSettled(ctx context.Context, records RecordRepository, cal calendar.ExternalCalendar, parentEventID string) error {
	parent, ok, err := records.FindAtForUpdate(ctx, calendar.EventLocation{ExternalCalendarID: cal.ID, ExternalEventID: parentEventID})
	if err != nil {
		return err
	}
	if ok && parent.Pending != nil {
		return errWritePending
	}
	return nil
}

// findListedOccurrence は、事業所 facilityID の一覧での ID が id の予定が、繰り返しの予定の展開した回なら、その回を返す。
// Projection の行の一覧での ID なら ok を false にする。回は、Projection を保持する期間（scheduleview.RetainedRange）の中で親を展開して探す。
func findListedOccurrence(ctx context.Context, projections Projections, now func() time.Time, facilityID, id string) (scheduleview.Occurrence, bool, error) {
	_, err := projections.GetBySchedule(ctx, facilityID, id)
	if !errors.Is(err, apperr.ErrNotFound) {
		return scheduleview.Occurrence{}, false, err
	}
	from, to := scheduleview.RetainedRange(now())
	rows, err := projections.ListByFacility(ctx, facilityID, civil.DateOf(from.Time().AddDate(0, 0, -1)))
	if err != nil {
		return scheduleview.Occurrence{}, false, err
	}
	return scheduleview.FindOccurrence(ctx, projections, facilityID, rows, calendar.ProjectionRules{}, id, from, to)
}

// requireParentETag は、繰り返しの予定の親 parent を Google から読み直し、etag が画面の読んだ etag と同じことを確認する。
// 展開した回の一覧の etag は親の予定の etag なので、回に書く前に親で比べる。Google の回の予定は親と別の etag を持ちうるので、
// 回の If-Match には付けない。違えば、読んだ親を Projection に写して errEventChanged を、取り消されていれば errEventNotFound を返す。
// 読めなければ、予定が無いときは errEventNotFound を、ほかは ErrGoogleUnavailable を包んだエラーを返す。
// 同じときは、読んだ親の予定を返す。
func requireParentETag(ctx context.Context, source calendar.EventSource, projections Projections, now func() time.Time, t tx.Transactor,
	parent parentEvent, etag string) (calendar.Event, error) {
	ev, err := readEvent(ctx, source, parent.cal.CalendarID, parent.row.EventID)
	switch {
	case errors.Is(err, calendar.ErrEventNotFound):
		return calendar.Event{}, errEventNotFound
	case err != nil:
		return calendar.Event{}, fmt.Errorf("%w: %w", ErrGoogleUnavailable, err)
	case ev.Status != calendar.StatusCancelled && ev.ETag == etag:
		return ev, nil
	}
	if err := t.WithinTx(ctx, func(ctx context.Context) error {
		return project(ctx, projections, civil.Today(now()), parent.cal, ev)
	}); err != nil {
		return calendar.Event{}, err
	}
	if ev.Status == calendar.StatusCancelled {
		return calendar.Event{}, errEventNotFound
	}
	return calendar.Event{}, errEventChanged
}

// listedInstance は、繰り返しの予定の親 parent の、元の規則で d に始まる回を Google から読む（findInstance）。
// etag が空でなければ、画面は展開した回を一覧で読んでいる。親の予定の etag を比べ（requireParentETag）、読んだ回が、親の予定を
// 展開した回のまま（followsParent）かも確認する。同期が Projection に例外の回を写す前に Google で回が変わっていると、親の予定の
// etag は変わらず、回の etag を If-Match に付けても新しい回を古い入力で上書きするか消すためである。
// 回が変わっていれば、読んだ回を Projection に写して errEventChanged を返す。エラーは requireParentETag と findInstance と同じである。
func listedInstance(ctx context.Context, source calendar.EventSource, projections Projections, now func() time.Time, t tx.Transactor,
	parent parentEvent, d civil.Date, etag string) (calendar.Event, error) {
	if etag == "" {
		return findInstance(ctx, source, parent.cal, parent.row.EventID, d)
	}
	parentNow, err := requireParentETag(ctx, source, projections, now, t, parent, etag)
	if err != nil {
		return calendar.Event{}, err
	}
	inst, err := findInstance(ctx, source, parent.cal, parent.row.EventID, d)
	if err != nil || followsParent(inst, parentNow, d) {
		return inst, err
	}
	if err := t.WithinTx(ctx, func(ctx context.Context) error {
		return project(ctx, projections, civil.Today(now()), parent.cal, inst)
	}); err != nil {
		return calendar.Event{}, err
	}
	return calendar.Event{}, errEventChanged
}

// followsParent は、Google の回 inst が、親の予定 parent を元の規則で d に展開した回と、タイトル、開始、長さが同じかを返す。
// 公式の文書は、events.instances の回が変えた回かを示す項目を書いていないので、親の予定から求めた回と比べる。
// タイトル、開始、終了のほかの項目（説明など）だけを変えた回は、変えていない回とみなす。日時を読めなければ false を返す。
// 出典: https://developers.google.com/workspace/calendar/api/v3/reference/events/instances
func followsParent(inst, parent calendar.Event, d civil.Date) bool {
	ps, err := parent.Start.Instant()
	if err != nil {
		return false
	}
	pe, err := parent.End.Instant()
	if err != nil {
		return false
	}
	is, err := inst.Start.Instant()
	if err != nil {
		return false
	}
	ie, err := inst.End.Instant()
	if err != nil {
		return false
	}
	ps = ps.In(calendar.Tokyo)
	start := time.Date(d.Year, d.Month, d.Day, ps.Hour(), ps.Minute(), ps.Second(), 0, calendar.Tokyo)
	return inst.Summary == parent.Summary && is.Equal(start) && ie.Sub(is) == pe.Sub(ps)
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
