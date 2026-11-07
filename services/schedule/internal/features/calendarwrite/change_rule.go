package calendarwrite

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"slices"
	"strconv"
	"strings"
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

// Types は、予定の種類を読む。実装は postgres.ScheduleTypeRepository である。
type Types interface {
	kernel.Finder[schedule.Type]
	// List は、全ての予定の種類を返す。
	List(ctx context.Context) ([]schedule.Type, error)
}

var errRuleUnsupported = apperr.Conflict("この繰り返しの予定の規則は buddy で表せません。Google カレンダーで変更してください")

// ChangeRule は、google_primary の事業所の繰り返しの予定の規則を、適用の日以降の回について変える（ADR-0037）。
// 当て方は schedule.PlanRuleChange で決め、Google カレンダーの繰り返しの予定（親の予定）の RRULE を書く。
type ChangeRule struct {
	update Update
	create Create
	cancel Cancel
	types  Types
}

// NewChangeRule は ChangeRule を作る。types のほかの引数は NewUpdate と同じである。
// now は、適用の日と終了日を比べる今日（Asia/Tokyo）と、書く期限を決める時刻である。nil なら time.Now を使う。
func NewChangeRule(locks FacilityLock, cutovers Cutovers, types Types, staffRefs kernel.Finder[staff.Ref], staffNames kernel.Finder[staff.Detail],
	visits VisitInfos, details VisitDetails, calendars Calendars, records RecordRepository, projections Projections, accounts calendar.Accounts,
	ids kernel.IDGenerator, log *slog.Logger, now func() time.Time, tx tx.Transactor) ChangeRule {
	if now == nil {
		now = time.Now
	}
	return ChangeRule{
		update: NewUpdate(locks, cutovers, types, staffRefs, staffNames, visits, details, calendars, records, projections, accounts, ids, log, now, tx),
		create: NewCreate(locks, cutovers, types, staffRefs, staffNames, visits, details, calendars, records, projections, accounts, now, tx),
		cancel: NewCancel(locks, cutovers, staffRefs, visits, calendars, records, projections, accounts, now, tx),
		types:  types,
	}
}

// Do は、事業所 facilityID の、一覧での ID が recurringScheduleID の繰り返しの予定の規則を、effective 以降の回について rule に変え、
// effective 以降の回を持つ繰り返しの予定を返す。recurringScheduleID は ChangeOccurrence.Do と同じく、記録の主キーか親の一覧での ID である。
// etag は画面が読んだ親の予定の etag で、親の予定を Google から読み直して比べる。親の予定を buddy の繰り返しの予定に写し、
// 当て方を schedule.PlanRuleChange で決める。今日は now の Asia/Tokyo の日付である。
//
// 境界の日（分けるときは effective、終了日だけの変更では新しい終了日の翌日）以降の、変えた例外の回は、同じカレンダーの単発の予定に
// 作り直してから消す（ADR-0037）。手順は、主訪問者を替えるときの移し方（Update.move）と同じで、回の一覧での ID を変えない。取り消した例外の回は変えない。
//   - 繰り返しの予定を分ける（schedule.RuleChangeSplit）: 画面が決めた ID が id の新しい繰り返しの予定を、CreateRecurring.Do と同じ手順で
//     同じカレンダーに作り、元の親の予定の RRULE の終了日を effective の前の日にする（events.patch）。
//   - 適用の日より前の回が無い（schedule.RuleChangeInPlace）: 分けるときと同じく id の新しい繰り返しの予定を作り、元の親の予定を消す。
//     取り消した例外の回が、新しい規則の回を隠さないためである。
//   - 終了日だけを変える（schedule.RuleChangeEndDate）: 親の予定の RRULE の終了日だけを変える。id は読まない。
//
// 新しい繰り返しの予定の時刻、タイトル、説明は親の予定から、訪問の情報は親の予定の記録の確定した版から写し、訪問の情報の行は新しく作る。
// 新しい繰り返しの予定を元の親の予定より先に書くのは、送り直しで同じ id を受けたときに、重複を作らずにやり直せるためである。
//
// etag が無いか、分けるときに id が無いか ULID でないとき、入力が schedule.PlanRuleChange の規則に合わないときは入力のエラーを返す。
// 親の予定の規則を buddy の規則に写せないときは apperr.ErrConflict を返す。ほかのエラーは ChangeOccurrence.Do と CreateRecurring.Do と同じである。
func (r ChangeRule) Do(ctx context.Context, facilityID, recurringScheduleID, id, etag string, effective *civil.Date,
	rule schedule.RuleInput) (scheduleview.RecurringDetail, error) {
	u := r.update
	if etag == "" {
		return scheduleview.RecurringDetail{}, apperr.Invalid("Google カレンダーを予定の正本にする事業所では、読んだ繰り返しの予定の etag が必須です")
	}
	if u.accounts == nil {
		return scheduleview.RecurringDetail{}, calendar.ErrNotConfigured
	}
	writer, err := u.accounts.Writer(ctx, facilityID)
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	source, err := u.accounts.Source(ctx, facilityID)
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	var (
		parent  parentEvent
		version int
	)
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireGooglePrimary(ctx, u.locks, u.cutovers, facilityID); err != nil {
			return err
		}
		if parent, err = lockParent(ctx, u.records, u.projections, u.staffRefs, u.calendars, facilityID, recurringScheduleID); err != nil {
			return err
		}
		rec, err := u.records.GetForUpdate(ctx, parent.row.ScheduleID)
		switch {
		case err == nil:
			version = rec.Version
		case !errors.Is(err, apperr.ErrNotFound):
			return err
		}
		return nil
	})
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	current, err := requireParentETag(ctx, source, u.projections, u.now, u.tx, parent, etag)
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	rs, exdates, err := recurringOf(current, parent.row)
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	plan, err := schedule.PlanRuleChange(rs, effective, schedule.Rule(rule), civil.Today(u.now()))
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	if plan.Kind != schedule.RuleChangeEndDate {
		if err := requireNewID(id, parent); err != nil {
			return scheduleview.RecurringDetail{}, err
		}
	}
	ctx = context.WithoutCancel(ctx)
	from := plan.ExclusionsFrom
	if plan.Kind == schedule.RuleChangeSplit {
		from = effective
	}
	moved, err := r.detachExceptions(ctx, source, writer, facilityID, parent, from)
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	if plan.Kind == schedule.RuleChangeEndDate {
		ev, err := r.writeRule(ctx, source, writer, parent, current, moved, plan.Kept)
		if err != nil {
			return scheduleview.RecurringDetail{}, err
		}
		return r.keptDetail(ctx, parent, current, plan.Kept, exdates, version, ev)
	}
	rd, err := r.createNext(ctx, facilityID, id, parent, current, plan.Next)
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	if plan.Kind == schedule.RuleChangeSplit {
		_, err = r.writeRule(ctx, source, writer, parent, current, moved, plan.Kept)
	} else {
		err = r.removeParent(ctx, source, writer, parent, current, moved)
	}
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	return rd, nil
}

// recurringOf は、Google の繰り返しの予定の親 ev を、取り込みと同じ規則（calendar.RuleFromRecurrence と calendar.Classify）で、
// 親の行 row の職員の buddy の繰り返しの予定と、除外する日（EXDATE）に写す。ID は親の一覧での ID にする。
// 規則か日時を写せなければ errRuleUnsupported を返す。
func recurringOf(ev calendar.Event, row scheduleview.ProjectionDetail) (schedule.RecurringSchedule, []civil.Date, error) {
	rec, err := calendar.RuleFromRecurrence(ev)
	if err != nil {
		return schedule.RecurringSchedule{}, nil, errRuleUnsupported
	}
	c := calendar.Classify(ev)
	if c.Kind == calendar.KindSkipped {
		return schedule.RecurringSchedule{}, nil, errRuleUnsupported
	}
	slot := schedule.Slot{
		FacilityID: row.FacilityID, StaffID: row.StaffID, Date: c.Date, StartTime: c.StartTime, EndTime: c.EndTime, EndsNextDay: c.EndsNextDay,
		IsOverTimeWork: schedule.IsOverTimeWork(c.StartTime),
	}
	return schedule.RecurringSchedule{ID: row.ScheduleID, Slot: slot, Rule: rec.Rule}, rec.ExclusionDates, nil
}

// requireNewID は、繰り返しの予定を分けるときの新しい繰り返しの予定の ID id が、ULID で、元の親の予定 parent の ID でないことを確認する。
// Google に書く前に確認し、例外の回を作り直した後に作成を拒まないためである。
func requireNewID(id string, parent parentEvent) error {
	if id == "" {
		return apperr.Invalid("Google カレンダーを予定の正本にする事業所で繰り返しの規則を変えるときは、新しい繰り返しの予定の ID（id）が必須です")
	}
	if _, err := calendar.EventIDOf(id); err != nil {
		return apperr.Invalid("予定の ID %s は ULID ではありません", id)
	}
	if id == parent.row.ScheduleID {
		return errIDTaken
	}
	return nil
}

// detachExceptions は、親の予定 parent の例外の回のうち、元の日付が from 以降の変えた回を、同じカレンダーの単発の予定に作り直す
// （Update.detachException）。from が nil なら何もしない。作り直した回の数を返す。
// 例外の回は、events.list（singleEvents=false）で、Projection を保持する期間（scheduleview.RetainedRange）の最初の日から読む。
// events.instances は、回が変えた回かを示さないためである。取り消した例外の回は events.list が cancelled で返すので、作り直さない。
// 読めなければ ErrGoogleUnavailable を包んだエラーを返す。1 つの回を作り直せなければ、そのエラーを返し、残りの回を作り直さない。
func (r ChangeRule) detachExceptions(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, facilityID string,
	parent parentEvent, from *civil.Date) (int, error) {
	if from == nil {
		return 0, nil
	}
	u := r.update
	// buddy が変えられる回は Projection を保持する期間の中にあるので、その期間だけを読む。終わりを渡さないと、calendarpit は繰り返しを含む一覧を拒む
	first, last := scheduleview.RetainedRange(u.now())
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	events, err := source.Events(callCtx, parent.cal.CalendarID, time.Date(first.Year, first.Month, first.Day, 0, 0, 0, 0, calendar.Tokyo),
		time.Date(last.Year, last.Month, last.Day+1, 0, 0, 0, 0, calendar.Tokyo))
	cancel()
	if err != nil {
		return 0, fmt.Errorf("%w: %w", ErrGoogleUnavailable, err)
	}
	moved := 0
	for _, ev := range events {
		d, ok := calendar.OriginalDate(ev)
		if ev.RecurringEventID != parent.row.EventID || ev.Status == calendar.StatusCancelled || !ok || d.Before(*from) {
			continue
		}
		if err := u.detachException(ctx, source, writer, facilityID, parent, ev, d); err != nil {
			return moved, err
		}
		moved++
	}
	return moved, nil
}

// detachException は、親の予定 parent の、元の規則で d に始まる例外の回 ex を、同じカレンダーの新しい ID の単発の予定に作り直してから、
// ex を If-Match を付けて消す（move）。主訪問者を替えるときの移し方と同じく、移す先を保留の版に持ち、確定すると記録が作った単発の予定を指す。
// 回の記録があれば、その主キーと確定した版の訪問の情報のまま版を進める。記録が無ければ、回の一覧での ID を主キーにした記録を作り、
// 親の予定の記録の確定した版の訪問の情報を写した訪問の情報を持たせる。単発の予定は、親の予定の訪問の情報を引き継げないためである。
// 回の記録か親の予定の記録に保留の版があれば errWritePending を返す。ほかのエラーは Update.move と同じである。
func (u Update) detachException(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, facilityID string,
	parent parentEvent, ex calendar.Event, d civil.Date) error {
	// 新しい ID で作る。Google は、消した予定と同じ ID の作成を 409 で拒むためである。
	toEventID, err := calendar.EventIDOf(u.ids.NewID())
	if err != nil {
		return err
	}
	c := change{from: parent.cal, fromEventID: ex.ID, to: parent.cal, toEventID: toEventID, etag: ex.ETag}
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireGooglePrimary(ctx, u.locks, u.cutovers, facilityID); err != nil {
			return err
		}
		p, err := lockParent(ctx, u.records, u.projections, u.staffRefs, u.calendars, facilityID, parent.row.ScheduleID)
		if err != nil {
			return err
		}
		pending := &calendar.PendingWrite{
			Version: 1, State: calendar.PendingWriting, Deadline: u.now().Add(WriteDeadline),
			MoveTo: &calendar.EventLocation{ExternalCalendarID: parent.cal.ID, ExternalEventID: toEventID},
		}
		at := calendar.EventLocation{ExternalCalendarID: parent.cal.ID, ExternalEventID: ex.ID}
		rec, ok, err := u.records.FindAtForUpdate(ctx, at)
		switch {
		case err != nil:
			return err
		case ok && rec.Pending != nil:
			return errWritePending
		case ok:
			c.scheduleID = rec.ScheduleID
			pending.Version, pending.VisitInfoID = rec.Version+1, rec.VisitInfoID
			rec.Pending = pending
			err = u.records.Update(ctx, rec)
		default:
			if c.scheduleID, err = exceptionListID(ctx, u.records, parent, d); err != nil {
				return err
			}
			if pending.VisitInfoID, err = copyVisit(ctx, u.visits, facilityID, p.row.Visit); err != nil {
				return err
			}
			err = u.records.Create(ctx, calendar.EventRecord{
				ScheduleID: c.scheduleID, FacilityID: facilityID, ExternalCalendarID: parent.cal.ID, ExternalEventID: ex.ID, Pending: pending,
			})
			if errors.Is(err, apperr.ErrConflict) {
				err = errWritePending
			}
		}
		if err != nil {
			return err
		}
		c.version = pending.Version
		description := ex.Description
		c.body = calendar.EventBody{
			Summary: ex.Summary, Description: &description, Start: ex.Start, End: ex.End,
			Private: map[string]string{calendar.PropScheduleID: c.scheduleID, calendar.PropVersion: strconv.Itoa(c.version)},
		}
		return nil
	})
	if err != nil {
		return err
	}
	_, err = u.move(ctx, source, writer, c)
	return err
}

// exceptionListID は、記録の無い、親の予定 parent の d の例外の回の一覧での ID を、一覧と同じ規則で返す。
// 回の一覧での ID を主キーに持つ記録があれば、その記録は回を移した先の予定を指すので、DetachedOccurrenceScheduleID を返す。
// トランザクションの中で呼ぶ。
func exceptionListID(ctx context.Context, records RecordRepository, parent parentEvent, d civil.Date) (string, error) {
	id := scheduleview.OccurrenceScheduleID(parent.cal.ID, parent.row.EventID, d)
	_, err := records.GetForUpdate(ctx, id)
	switch {
	case errors.Is(err, apperr.ErrNotFound):
		return id, nil
	case err != nil:
		return "", err
	}
	return scheduleview.DetachedOccurrenceScheduleID(parent.cal.ID, parent.row.EventID, d), nil
}

// copyVisit は、訪問の情報 v と同じ内容の訪問の情報を新しく作り、その ID を返す。v が nil なら nil を返す。
func copyVisit(ctx context.Context, visits VisitInfos, facilityID string, v *visit.Detail) (*string, error) {
	in := visitInputOf(v)
	if in == nil {
		return nil, nil
	}
	id, err := visits.Create(ctx, facilityID, *in)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// visitInputOf は、保存した訪問の情報 v を、同じ内容の訪問の情報を作る入力にする。v が nil なら nil を返す。
func visitInputOf(v *visit.Detail) *visit.Input {
	if v == nil {
		return nil
	}
	ids := make([]string, len(v.Categories))
	for i, c := range v.Categories {
		ids[i] = c.ID
	}
	return &visit.Input{PatientID: v.PatientID, AssignedStaffID: v.AssignedStaffID, CompanionID: v.CompanionID, ServiceCodeID: v.ServiceCodeID, CategoryIDs: ids}
}

// createNext は、事業所 facilityID に、ID が id の、next の最初の日付と規則の繰り返しの予定を、CreateRecurring.Do と同じ手順で
// 親の予定 parent の職員のカレンダーに作り、作った繰り返しの予定を返す。時刻は next から、タイトルと説明は親の予定 current から、
// 訪問の情報は親の予定の記録の確定した版から写す。訪問の情報は schedule.PrepareChange で新しく作り、親の予定の職員と訪問の情報の職員は、
// 休職か退職でも同じ役割のまま写せる。
func (r ChangeRule) createNext(ctx context.Context, facilityID, id string, parent parentEvent, current calendar.Event,
	next schedule.RecurringSchedule) (scheduleview.RecurringDetail, error) {
	cr := r.create
	w, ev, err := cr.run(ctx, facilityID, id, func(ctx context.Context) (write, string, *string, error) {
		p, err := lockParent(ctx, cr.records, cr.projections, cr.staffRefs, cr.calendars, facilityID, parent.row.ScheduleID)
		if err != nil {
			return write{}, "", nil, err
		}
		typ, err := r.typeOf(ctx, p.row.Visit)
		if err != nil {
			return write{}, "", nil, err
		}
		in := schedule.SlotInput{
			TypeID: typ.ID, Date: next.Date, StartTime: next.StartTime, EndTime: next.EndTime, EndsNextDay: next.EndsNextDay,
			StaffID: p.row.StaffID, Description: descriptionOf(current), Visit: visitInputOf(p.row.Visit),
		}
		if p.row.Visit == nil {
			title := calendar.NormalTitle(current.Summary)
			in.Title = &title
		}
		var keptVisit *string
		if p.row.Visit != nil {
			keptVisit = &p.row.Visit.ID
		}
		kept, err := visitInfoOf(ctx, cr.details, keptVisit)
		if err != nil {
			return write{}, "", nil, err
		}
		sc, typ, err := schedule.PrepareChange(ctx, cr.types, cr.staffRefs, cr.visits, cr.now, facilityID, id, in, p.row.StaffID, kept)
		if err != nil {
			return write{}, "", nil, err
		}
		rs, err := schedule.NewRecurring(id, sc.Slot, typ, next.Rule)
		if err != nil {
			return write{}, "", nil, err
		}
		st, err := cr.staffNames.Get(ctx, rs.StaffID)
		if err != nil {
			return write{}, "", nil, err
		}
		rd := scheduleview.RecurringDetail{RecurringSchedule: rs, TypeName: typ.Name, StaffName: st.Username, ExclusionDates: []civil.Date{}}
		w := write{recurring: &rd}
		if err := w.useVisit(ctx, cr.details, rs.VisitInfoID); err != nil {
			return write{}, "", nil, err
		}
		w.body = calendar.RecurringBody(rd, nil)
		return w, rs.StaffID, rs.VisitInfoID, nil
	})
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	d := resultOf(scheduleview.Detail{}, w.version, ev, cr.now())
	rd := *w.recurring
	rd.Version, rd.CreatedAt, rd.UpdatedAt = d.Version, d.CreatedAt, d.UpdatedAt
	return rd, nil
}

// descriptionOf は、Google の予定 ev の説明を返す。説明が無ければ nil を返す。
func descriptionOf(ev calendar.Event) *string {
	if ev.Description == "" {
		return nil
	}
	d := ev.Description
	return &d
}

// typeOf は、訪問の情報 v があれば訪問の予定の種類を、無ければ通常の予定の種類を返す。
func (r ChangeRule) typeOf(ctx context.Context, v *visit.Detail) (schedule.Type, error) {
	code := schedule.CodeNormal
	if v != nil {
		code = schedule.CodeVisit
	}
	types, err := r.types.List(ctx)
	if err != nil {
		return schedule.Type{}, err
	}
	for _, t := range types {
		if t.Code == code {
			return t, nil
		}
	}
	return schedule.Type{}, fmt.Errorf("予定の種類 %s がマスタに無い", code)
}

// writeRule は、親の予定 parent の RRULE を、繰り返しの予定 kept の規則にする（events.patch）。EXDATE の行は今のまま残し、
// タイトル、日時、extendedProperties.private は変えない。If-Match には、読み直した親の予定の etag を付ける（settledParent）。
// 書いた親の予定を Projection に写して返す。Google が受けたかが分からなければ ErrWriteUnknown を包んだエラーを返す。
// Google で親の予定が変わっていたか消されていたら、Google の今の予定を Projection に写して、Update.Do と同じエラーを返す。
func (r ChangeRule) writeRule(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, parent parentEvent,
	current calendar.Event, moved int, kept schedule.RecurringSchedule) (calendar.Event, error) {
	u := r.update
	cur, err := r.settledParent(ctx, source, parent, current, moved)
	if err != nil {
		return calendar.Event{}, err
	}
	body := calendar.EventBody{
		Summary: cur.Summary, Start: cur.Start, End: cur.End, Recurrence: withRRule(cur.Recurrence, kept), Private: maps.Clone(cur.Private),
	}
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	ev, err := writer.Update(callCtx, parent.cal.CalendarID, parent.row.EventID, cur.ETag, body)
	cancel()
	if err != nil {
		return calendar.Event{}, r.parentWriteError(ctx, source, parent, err)
	}
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		return project(ctx, u.projections, civil.Today(u.now()), parent.cal, ev)
	})
	if err != nil {
		return calendar.Event{}, err
	}
	return ev, nil
}

// removeParent は、適用の日より前の回が無い親の予定 parent を、読み直した etag を If-Match に付けて消す（Cancel.remove）。
// 親の予定の記録と訪問の情報も消す。エラーは Cancel.Do と同じである。
func (r ChangeRule) removeParent(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, parent parentEvent,
	current calendar.Event, moved int) error {
	cur, err := r.settledParent(ctx, source, parent, current, moved)
	if err != nil {
		return err
	}
	return r.cancel.remove(ctx, source, writer, parent.row.ScheduleID, parent.cal, parent.row.EventID, cur.ETag)
}

// settledParent は、親の予定 parent に書く前の、親の予定の今の版を返す。例外の回を作り直していなければ（moved が 0）、
// 画面の etag と比べた current を返す。作り直していれば、親の予定を読み直し、タイトル、日時、説明、繰り返しの規則が current と同じなら、
// 読み直した予定を返す。公式の文書は、例外の回を消すと親の予定の etag が変わるかを書いていないためである。
// 違えば、読み直した予定を Projection に写して errEventChanged を、取り消されていれば errEventNotFound を返す。
// 読めなければ、予定が無いときは errEventNotFound を、ほかは ErrGoogleUnavailable を包んだエラーを返す。
func (r ChangeRule) settledParent(ctx context.Context, source calendar.EventSource, parent parentEvent, current calendar.Event,
	moved int) (calendar.Event, error) {
	if moved == 0 {
		return current, nil
	}
	u := r.update
	ev, err := readEvent(ctx, source, parent.cal.CalendarID, parent.row.EventID)
	switch {
	case errors.Is(err, calendar.ErrEventNotFound):
		return calendar.Event{}, errEventNotFound
	case err != nil:
		return calendar.Event{}, fmt.Errorf("%w: %w", ErrGoogleUnavailable, err)
	case ev.Status != calendar.StatusCancelled && sameParent(ev, current):
		return ev, nil
	}
	if err := u.tx.WithinTx(ctx, func(ctx context.Context) error {
		return project(ctx, u.projections, civil.Today(u.now()), parent.cal, ev)
	}); err != nil {
		return calendar.Event{}, err
	}
	if ev.Status == calendar.StatusCancelled {
		return calendar.Event{}, errEventNotFound
	}
	return calendar.Event{}, errEventChanged
}

// sameParent は、2 つの親の予定 a と b の、タイトル、説明、繰り返しの規則、開始と終了が同じかを返す。
func sameParent(a, b calendar.Event) bool {
	return a.Summary == b.Summary && a.Description == b.Description && slices.Equal(a.Recurrence, b.Recurrence) &&
		sameInstant(a.Start, b.Start) && sameInstant(a.End, b.End)
}

// parentWriteError は、親の予定の部分更新のエラーを、Update.fail と同じ応答のエラーにする。親の予定の書き込みは、訪問の情報を
// 変えないので保留の版を持たない。Google で親の予定が変わっていたか消されていたら、Google の今の予定を Projection に写す。
func (r ChangeRule) parentWriteError(ctx context.Context, source calendar.EventSource, parent parentEvent, err error) error {
	u := r.update
	if errors.Is(err, calendar.ErrOutcomeUnknown) {
		return fmt.Errorf("%w: %w", ErrWriteUnknown, err)
	}
	if errors.Is(err, calendar.ErrEventChanged) || errors.Is(err, calendar.ErrEventGone) {
		if perr := reproject(ctx, source, u.projections, u.now, u.tx, parent.cal, parent.row.EventID); perr != nil {
			return perr
		}
	}
	return writeError(err)
}

// withRRule は、繰り返しの規則の行 lines の RRULE の行を、繰り返しの予定 rs の規則の RRULE の行（calendar.RecurrenceOf）に置き換える。
// EXDATE などのほかの行は、そのまま残す。
func withRRule(lines []string, rs schedule.RecurringSchedule) []string {
	rrule := calendar.RecurrenceOf(rs, nil)[0]
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.HasPrefix(strings.ToUpper(line), "RRULE:") {
			out = append(out, rrule)
			continue
		}
		out = append(out, line)
	}
	return out
}

// keptDetail は、終了日だけを変えた親の予定 parent の応答を、変えた後の繰り返しの予定 rs と、書いた親の予定 ev から作る。
// タイトルと説明は親の予定 current から、訪問の情報は親の予定の記録の確定した版から読み、除外する日は EXDATE の日 exdates にする。
// 版は親の予定の記録の確定した版 version で、記録が無ければ 1 にする。
func (r ChangeRule) keptDetail(ctx context.Context, parent parentEvent, current calendar.Event, rs schedule.RecurringSchedule,
	exdates []civil.Date, version int, ev calendar.Event) (scheduleview.RecurringDetail, error) {
	typ, err := r.typeOf(ctx, parent.row.Visit)
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	rs.TypeID, rs.Description = typ.ID, descriptionOf(current)
	if v := parent.row.Visit; v != nil {
		rs.VisitInfoID = &v.ID
	} else {
		title := calendar.NormalTitle(current.Summary)
		rs.Title = &title
	}
	if exdates == nil {
		exdates = []civil.Date{}
	}
	rd := scheduleview.RecurringDetail{
		RecurringSchedule: rs, TypeName: typ.Name, StaffName: parent.row.StaffName, Visit: parent.row.Visit, ExclusionDates: exdates,
	}
	d := resultOf(scheduleview.Detail{}, version, ev, r.update.now())
	rd.Version, rd.CreatedAt, rd.UpdatedAt = d.Version, d.CreatedAt, d.UpdatedAt
	return rd, nil
}
