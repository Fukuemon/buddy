package calendarwrite

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Cancel は、google_primary の事業所の単発の予定を、Google カレンダーの予定を消して取り消す（ADR-0029）。
type Cancel struct {
	locks       FacilityLock
	cutovers    Cutovers
	staffRefs   kernel.Finder[staff.Ref]
	visits      VisitInfos
	calendars   Calendars
	records     RecordRepository
	projections Projections
	accounts    calendar.Accounts
	now         func() time.Time
	tx          tx.Transactor
}

// NewCancel は Cancel を作る。accounts が nil（サービスアカウントの設定が無い）なら、Do は calendar.ErrNotConfigured を返す。
// now は、取り消しの状態の Projection の行が終わる日を決める時刻である。nil なら time.Now を使う。
func NewCancel(locks FacilityLock, cutovers Cutovers, staffRefs kernel.Finder[staff.Ref], visits VisitInfos, calendars Calendars,
	records RecordRepository, projections Projections, accounts calendar.Accounts, now func() time.Time, tx tx.Transactor) Cancel {
	if now == nil {
		now = time.Now
	}
	return Cancel{
		locks: locks, cutovers: cutovers, staffRefs: staffRefs, visits: visits, calendars: calendars, records: records,
		projections: projections, accounts: accounts, now: now, tx: tx,
	}
}

// Do は、事業所 facilityID の、一覧での ID が id の単発の予定の Google の予定を、etag を If-Match に付けて消し、取り消しを返す。
// id が繰り返しの予定の展開した回の一覧での ID なら、その回を取り消す（CancelOccurrence.Do と同じ）。etag は親の予定の etag で、
// 親の予定を Google から読み直して比べる。
// 取り消しの ID は予定の ID と同じで、理由 reason は Google に書けないので保存しない。消せたら、Projection の行を取り消しの状態にし、
// 予定の記録と訪問の情報を消す（ADR-0029 の、Google で取り消した予定の訪問の情報の行は消す規則）。
// Google の予定に保留の版は置かない。消す書き込みは、Google が受けたかが分からなくても、残す訪問の情報を持たないためである。
//
// 理由の入力のエラーと apperr.ErrForbidden は schedule.Cancel と同じである。予定が無いときは apperr.ErrNotFound を返す。
// 次のときは apperr.ErrConflict を返す: 事業所が google_primary でない、open の移行がある（CodeCutoverOpen）、予定に保留の版が
// ある（CodeWritePending）、読んだ後に Google で予定が変わった（CodeEventChanged）、Google で予定が消されたか見つからない
// （CodeEventNotFound）、カレンダーに書けない（CodeCalendarUnwritable）、繰り返しの予定の親である、例外の回か展開した回の親の記録に保留の版がある（CodeWritePending）。
// CodeEventChanged と、Google で消されていたときは、Google の今の予定を Projection に写す。
// Google が受けたかが分からないときは ErrWriteUnknown を、Google が一時的に拒んだときは ErrGoogleUnavailable を包んだエラーを返す。
func (c Cancel) Do(ctx context.Context, facilityID, id, etag, reason string) (schedule.Cancellation, error) {
	cn, err := schedule.NewCancellation(id, id, reason)
	if err != nil {
		return schedule.Cancellation{}, err
	}
	if etag == "" {
		return schedule.Cancellation{}, apperr.Invalid("予定を Google カレンダーで管理している事業所では、読んだ予定の etag が必須です")
	}
	if c.accounts == nil {
		return schedule.Cancellation{}, calendar.ErrNotConfigured
	}
	occ, ok, err := findListedOccurrence(ctx, c.projections, c.now, facilityID, id)
	if err != nil {
		return schedule.Cancellation{}, err
	}
	if ok {
		return c.cancelOccurrence(ctx, facilityID, occ.Parent.ScheduleID, occ.Date, occ.ID, etag, reason)
	}
	writer, err := c.accounts.Writer(ctx, facilityID)
	if err != nil {
		return schedule.Cancellation{}, err
	}
	source, err := c.accounts.Source(ctx, facilityID)
	if err != nil {
		return schedule.Cancellation{}, err
	}
	var (
		cal     calendar.ExternalCalendar
		eventID string
	)
	err = c.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireGooglePrimary(ctx, c.locks, c.cutovers, facilityID); err != nil {
			return err
		}
		_, row, err := lockStoredEvent(ctx, c.records, c.projections, facilityID, id)
		if err != nil {
			return err
		}
		if err := schedule.RequireScheduleAccess(ctx, c.staffRefs, row.StaffID, true); err != nil {
			return err
		}
		eventID = row.EventID
		if cal, err = c.calendars.Get(ctx, row.ExternalCalendarID); err != nil {
			return err
		}
		if row.IsException() {
			return requireParentSettled(ctx, c.records, cal, row.RecurringEventID)
		}
		return nil
	})
	if err != nil {
		return schedule.Cancellation{}, err
	}
	if err := c.remove(context.WithoutCancel(ctx), source, writer, id, cal, eventID, etag); err != nil {
		return schedule.Cancellation{}, err
	}
	return cn, nil
}

// remove は、カレンダー cal の Google の予定 eventID を、etag を If-Match に付けて消す。消せたら、予定を読み直して Projection の行を
// 取り消しの状態にし、予定 id の記録と訪問の情報を消す（forget）。エラーは Do と同じである。
func (c Cancel) remove(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, id string, cal calendar.ExternalCalendar,
	eventID, etag string) error {
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	err := writer.Delete(callCtx, cal.CalendarID, eventID, etag)
	cancel()
	switch {
	case err == nil:
	case errors.Is(err, calendar.ErrOutcomeUnknown):
		return fmt.Errorf("%w: %w", ErrWriteUnknown, err)
	case errors.Is(err, calendar.ErrEventChanged), errors.Is(err, calendar.ErrEventGone):
		if perr := reproject(ctx, source, c.projections, c.now, c.tx, cal, eventID); perr != nil {
			return perr
		}
		return writeError(err)
	default:
		return writeError(err)
	}
	ev, readErr := readEvent(ctx, source, cal.CalendarID, eventID)
	return c.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := c.forget(ctx, id, calendar.EventLocation{ExternalCalendarID: cal.ID, ExternalEventID: eventID}); err != nil {
			return err
		}
		if readErr != nil {
			// shortcut: 消した後に読めなければ、取り消しの行は同期が写す。それまで一覧に予定が残る
			return nil
		}
		return project(ctx, c.projections, civil.Today(c.now()), cal, ev)
	})
}

// forget は、消した予定 at を指す予定 id の記録と、その訪問の情報を消す。記録が無いか、ほかの予定を指すか、
// 保留の版を持つ（消した後に始まった書き込みがある）なら何もしない。トランザクションの中で呼ぶ。
func (c Cancel) forget(ctx context.Context, id string, at calendar.EventLocation) error {
	rec, err := c.records.GetForUpdate(ctx, id)
	if errors.Is(err, apperr.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if rec.Pending != nil || rec.Location() != at {
		return nil
	}
	if err := c.records.Delete(ctx, id); err != nil {
		return err
	}
	return deleteVisit(ctx, c.visits, rec.VisitInfoID)
}
