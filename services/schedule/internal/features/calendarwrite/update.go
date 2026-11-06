package calendarwrite

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Update は、google_primary の事業所の単発の予定を、Google カレンダーの予定を書き換えて変える（ADR-0028）。
type Update struct {
	locks       FacilityLock
	cutovers    Cutovers
	types       kernel.Finder[schedule.Type]
	staffRefs   kernel.Finder[staff.Ref]
	staffNames  kernel.Finder[staff.Detail]
	visits      VisitInfos
	details     VisitDetails
	calendars   Calendars
	records     RecordRepository
	projections Projections
	accounts    calendar.Accounts
	ids         kernel.IDGenerator
	log         *slog.Logger
	now         func() time.Time
	tx          tx.Transactor
}

// NewUpdate は Update を作る。accounts が nil（サービスアカウントの設定が無い）なら、Do は calendar.ErrNotConfigured を返す。
// ids は、予定を別のカレンダーに移すときに作る Google の予定の ID の元にする。log には、移した後に前のカレンダーの予定を消せなかったことを書く。
// now は、書く期限と、退職した職員を割り振ったまま保存できる予定の日付を決める時刻である。nil なら time.Now を使う。
func NewUpdate(locks FacilityLock, cutovers Cutovers, types kernel.Finder[schedule.Type], staffRefs kernel.Finder[staff.Ref], staffNames kernel.Finder[staff.Detail],
	visits VisitInfos, details VisitDetails, calendars Calendars, records RecordRepository, projections Projections, accounts calendar.Accounts,
	ids kernel.IDGenerator, log *slog.Logger, now func() time.Time, tx tx.Transactor) Update {
	if now == nil {
		now = time.Now
	}
	return Update{
		locks: locks, cutovers: cutovers, types: types, staffRefs: staffRefs, staffNames: staffNames, visits: visits, details: details,
		calendars: calendars, records: records, projections: projections, accounts: accounts, ids: ids, log: log, now: now, tx: tx,
	}
}

// change は、1 回の変更で Google に書くものである。
type change struct {
	scheduleID string
	// version は、Google に書く保留の版である。
	version int
	// from と fromEventID は、変える前の予定の場所で、to と toEventID は書く先である。主訪問者を替えない変更では同じである。
	from        calendar.ExternalCalendar
	fromEventID string
	to          calendar.ExternalCalendar
	toEventID   string
	// etag は、画面が読んだ予定の etag で、If-Match に付ける。
	etag   string
	body   calendar.EventBody
	detail scheduleview.Detail
}

// moving は、予定を別のカレンダーに移す変更かを返す。
func (c change) moving() bool { return c.to.ID != c.from.ID }

// Do は、事業所 facilityID の、一覧での ID が id の単発の予定を in の内容に変え、書いた予定を返す。etag は画面が読んだ予定の etag で、
// If-Match に付けて Google に書く。書き込みは ADR-0028 の手順と保留の版に従い、Create と同じである。
// 記録の無い予定（Google で作った予定）を変えると、id を予定の ID にした記録を作る。訪問の情報を足せば、記録が訪問の情報を持つ。
// 予定の職員（主訪問者）を替えると、新しい職員のカレンダーに予定を作り、前のカレンダーの予定を消す（move）。
// 繰り返しの予定の例外の回（Google で変えた回）は、回の予定を書き換える。回の記録が無ければ、訪問の情報を変えたときだけ id の記録を作る。
// id が繰り返しの予定の展開した回の一覧での ID なら、回を Google の例外の回にして変える（ChangeOccurrence.Do と同じ）。etag は親の予定の etag で、
// 親の予定を Google から読み直して比べる。
//
// 入力と参照のエラー、apperr.ErrForbidden は schedule.Update と同じである。予定が無いときは apperr.ErrNotFound を返す。
// 次のときは apperr.ErrConflict を返す: 事業所が google_primary でない、open の切り替えがある（CodeCutoverOpen）、新しい予定の職員に
// 外していないカレンダーが無い（CodeCalendarNotLinked）、予定に保留の版がある（CodeWritePending）、読んだ後に Google で予定が変わった
// （CodeEventChanged）、Google で予定が消されたか見つからない（CodeEventNotFound）、カレンダーに書けない（CodeCalendarUnwritable）、
// Google が内容を受け付けない（CodeEventRejected）、繰り返しの予定の親である、例外の回の親の記録に保留の版がある（CodeWritePending）。
// CodeEventChanged と、Google で消されていたときは、Google の今の予定を Projection に写す。
// Google が受けたかが分からないときは保留の版を残して ErrWriteUnknown を、Google が一時的に拒んだときは ErrGoogleUnavailable を包んだエラーを返す。
// 保留の版を書いた後は、リクエストが取り消されても、Google の結果を記録に残すまで続ける。
func (u Update) Do(ctx context.Context, facilityID, id, etag string, in schedule.SlotInput) (scheduleview.Detail, error) {
	if etag == "" {
		return scheduleview.Detail{}, apperr.Invalid("Google カレンダーを予定の正本にする事業所では、読んだ予定の etag が必須です")
	}
	if u.accounts == nil {
		return scheduleview.Detail{}, calendar.ErrNotConfigured
	}
	occ, ok, err := findListedOccurrence(ctx, u.projections, u.now, facilityID, id)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	if ok {
		return u.changeOccurrence(ctx, facilityID, occ.Parent.ScheduleID, occ.Date, occ.ID, etag, in)
	}
	writer, err := u.accounts.Writer(ctx, facilityID)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	source, err := u.accounts.Source(ctx, facilityID)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	var c change
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		c, err = u.begin(ctx, facilityID, id, etag, in)
		return err
	})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	return u.write(context.WithoutCancel(ctx), source, writer, c)
}

// write は、手順 2 から 5 を行う。c の予定を Google で部分更新し、予定を移す変更では move で移す。
func (u Update) write(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, c change) (scheduleview.Detail, error) {
	if c.moving() {
		return u.move(ctx, source, writer, c)
	}
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	ev, err := writer.Update(callCtx, c.to.CalendarID, c.toEventID, c.etag, c.body)
	cancel()
	if err != nil {
		return scheduleview.Detail{}, u.fail(ctx, source, c, err)
	}
	return u.confirm(ctx, c, ev, nil)
}

// begin は、手順 1 を 1 つ目のトランザクションの中で行い、Google に書くものを返す。
func (u Update) begin(ctx context.Context, facilityID, id, etag string, in schedule.SlotInput) (change, error) {
	if err := requireGooglePrimary(ctx, u.locks, u.cutovers, facilityID); err != nil {
		return change{}, err
	}
	rec, row, err := lockStoredEvent(ctx, u.records, u.projections, facilityID, id)
	if err != nil {
		return change{}, err
	}
	if err := schedule.RequireScheduleAccess(ctx, u.staffRefs, row.StaffID, true); err != nil {
		return change{}, err
	}
	if row.IsException() {
		cal, err := u.calendars.Get(ctx, row.ExternalCalendarID)
		if err != nil {
			return change{}, err
		}
		if err := requireParentSettled(ctx, u.records, cal, row.RecurringEventID); err != nil {
			return change{}, err
		}
		return u.beginOccurrence(ctx, facilityID, id, rec, cal, row.EventID, etag, row.StaffID, row.Visit, in)
	}
	var storedVisit *string
	if rec != nil {
		storedVisit = rec.VisitInfoID
	}
	kept, err := visitInfoOf(ctx, u.details, storedVisit)
	if err != nil {
		return change{}, err
	}
	sc, typ, err := schedule.PrepareChange(ctx, u.types, u.staffRefs, u.visits, u.now, facilityID, id, in, row.StaffID, kept)
	if err != nil {
		return change{}, err
	}
	to, err := u.calendars.ActiveByStaff(ctx, sc.StaffID)
	if errors.Is(err, apperr.ErrNotFound) {
		return change{}, errCalendarNotLinked
	}
	if err != nil {
		return change{}, err
	}
	c := change{scheduleID: id, from: to, fromEventID: row.EventID, to: to, toEventID: row.EventID, etag: etag}
	if to.ID != row.ExternalCalendarID {
		if c.from, err = u.calendars.Get(ctx, row.ExternalCalendarID); err != nil {
			return change{}, err
		}
		// 移す先には新しい ID で作る。同じカレンダーに戻すとき、Google は消した予定の ID での作成を 409 で拒むためである。
		// 出典: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
		if c.toEventID, err = calendar.EventIDOf(u.ids.NewID()); err != nil {
			return change{}, err
		}
	}
	if c.detail, err = describe(ctx, u.staffNames, u.details, sc, typ); err != nil {
		return change{}, err
	}
	pending := &calendar.PendingWrite{Version: 1, State: calendar.PendingWriting, VisitInfoID: sc.VisitInfoID, Deadline: u.now().Add(WriteDeadline)}
	if c.moving() {
		pending.MoveTo = &calendar.EventLocation{ExternalCalendarID: c.to.ID, ExternalEventID: c.toEventID}
	}
	if rec != nil {
		pending.Version = rec.Version + 1
		rec.Pending = pending
		err = u.records.Update(ctx, *rec)
	} else {
		err = u.records.Create(ctx, calendar.EventRecord{
			ScheduleID: id, FacilityID: facilityID, ExternalCalendarID: row.ExternalCalendarID, ExternalEventID: row.EventID, Pending: pending,
		})
		if errors.Is(err, apperr.ErrConflict) {
			err = errWritePending
		}
	}
	if err != nil {
		return change{}, err
	}
	c.version = pending.Version
	c.body = bodyOf(c.detail, c.version)
	return c, nil
}

// move は、予定を新しい職員のカレンダーに移す。前のカレンダーの予定を読んで etag を比べ、新しいカレンダーに作ってから、前の予定を
// If-Match を付けて消す。前の予定を消せなかったときは、作った予定で保留の版を確定し、前の予定を残してログに書く。
// 前の予定は記録を持たない Google の予定として一覧に出て、職員が取り消せる。
func (u Update) move(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, c change) (scheduleview.Detail, error) {
	cur, err := readEvent(ctx, source, c.from.CalendarID, c.fromEventID)
	if err != nil {
		if rerr := u.reject(ctx, c, nil); rerr != nil {
			return scheduleview.Detail{}, rerr
		}
		if errors.Is(err, calendar.ErrEventNotFound) {
			return scheduleview.Detail{}, errEventNotFound
		}
		return scheduleview.Detail{}, fmt.Errorf("%w: %w", ErrGoogleUnavailable, err)
	}
	if cur.Status == calendar.StatusCancelled || cur.ETag != c.etag {
		if err := u.reject(ctx, c, &cur); err != nil {
			return scheduleview.Detail{}, err
		}
		if cur.Status == calendar.StatusCancelled {
			return scheduleview.Detail{}, errEventNotFound
		}
		return scheduleview.Detail{}, errEventChanged
	}
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	ev, err := writer.Insert(callCtx, c.to.CalendarID, c.toEventID, c.body)
	cancel()
	if err != nil {
		return scheduleview.Detail{}, u.fail(ctx, source, c, err)
	}
	callCtx, cancel = context.WithTimeout(ctx, CallTimeout)
	err = writer.Delete(callCtx, c.from.CalendarID, c.fromEventID, c.etag)
	cancel()
	var prev *calendar.Event
	if err == nil || errors.Is(err, calendar.ErrEventGone) {
		if old, rerr := readEvent(ctx, source, c.from.CalendarID, c.fromEventID); rerr == nil {
			prev = &old
		}
	} else {
		u.log.WarnContext(ctx, "calendar write previous event left",
			slog.String("facility_id", c.from.FacilityID), slog.String("external_calendar_id", c.from.ID),
			slog.String("event_id", c.fromEventID), slog.Any("error", err))
	}
	return u.confirm(ctx, c, ev, prev)
}

// confirm は、手順 3 を行う。2 つ目のトランザクションで、保留の版を確定し、Google が返した予定 ev を Projection に写す。
// prev は、予定を移したときの前のカレンダーの予定で、あれば一緒に写す。
func (u Update) confirm(ctx context.Context, c change, ev calendar.Event, prev *calendar.Event) (scheduleview.Detail, error) {
	today := civil.Today(u.now())
	err := u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := confirmPending(ctx, u.records, u.visits, c.scheduleID, c.version); err != nil {
			return err
		}
		if prev != nil {
			if err := project(ctx, u.projections, today, c.from, *prev); err != nil {
				return err
			}
		}
		return project(ctx, u.projections, today, c.to, ev)
	})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	return resultOf(c.detail, c.version, ev, u.now()), nil
}

// fail は、Google が書き込みを受けなかったか、受けたかが分からないときに、保留の版を解いてエラーを返す。
// 結果が分からなければ保留の版を残す（手順 5）。ほかは保留の版を消し（手順 4）、Google で予定が変わっていたか消されていたら、
// Google の今の予定を Projection に写す。
func (u Update) fail(ctx context.Context, source calendar.EventSource, c change, err error) error {
	if errors.Is(err, calendar.ErrOutcomeUnknown) {
		if serr := u.tx.WithinTx(ctx, func(ctx context.Context) error {
			return markUnknown(ctx, u.records, c.scheduleID, c.version)
		}); serr != nil {
			return serr
		}
		return fmt.Errorf("%w: %w", ErrWriteUnknown, err)
	}
	if rerr := u.reject(ctx, c, nil); rerr != nil {
		return rerr
	}
	if errors.Is(err, calendar.ErrEventChanged) || errors.Is(err, calendar.ErrEventGone) {
		if perr := reproject(ctx, source, u.projections, u.now, u.tx, c.from, c.fromEventID); perr != nil {
			return perr
		}
	}
	return writeError(err)
}

// reject は、保留の版を消し、訪問の情報と記録を書く前に戻す。cur があれば、読んだ前のカレンダーの予定を Projection に写す。
func (u Update) reject(ctx context.Context, c change, cur *calendar.Event) error {
	return u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := rejectPending(ctx, u.records, u.visits, c.scheduleID, c.version); err != nil {
			return err
		}
		if cur == nil {
			return nil
		}
		return project(ctx, u.projections, civil.Today(u.now()), c.from, *cur)
	})
}
