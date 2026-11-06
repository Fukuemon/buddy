package calendarwrite

import (
	"context"
	"log/slog"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// ChangeOccurrence は、google_primary の事業所の繰り返しの予定の 1 回を、Google カレンダーの例外の回にして変える（ADR-0026）。
// 親の予定の EXDATE は変えない。
type ChangeOccurrence struct {
	update Update
}

// NewChangeOccurrence は ChangeOccurrence を作る。引数は NewUpdate と同じである。
func NewChangeOccurrence(locks FacilityLock, cutovers Cutovers, types kernel.Finder[schedule.Type], staffRefs kernel.Finder[staff.Ref], staffNames kernel.Finder[staff.Detail],
	visits VisitInfos, details VisitDetails, calendars Calendars, records RecordRepository, projections Projections, accounts calendar.Accounts,
	ids kernel.IDGenerator, log *slog.Logger, now func() time.Time, tx tx.Transactor) ChangeOccurrence {
	return ChangeOccurrence{update: NewUpdate(locks, cutovers, types, staffRefs, staffNames, visits, details, calendars, records, projections, accounts, ids, log, now, tx)}
}

// Do は、事業所 facilityID の、一覧での ID が recurringScheduleID の繰り返しの予定の、元の規則で originalDate に始まる回を in の内容に変え、
// 変えた回の予定を返す。回は events.instances で Google から読み、回の予定（Google の例外の回）を、読んだ回の etag を If-Match に付けて書く。
// 応答の予定の ID は、回の一覧での ID（scheduleview.OccurrenceScheduleID）で、回を変える前と同じである。
// 訪問の情報は親の予定の記録のものを引き継ぎ、回で訪問の情報を変えたときだけ、回の一覧での ID の記録を足す。
// 予定の職員を替えると、元のカレンダーの回を取り消し、新しい職員のカレンダーに単発の予定を作る（Update.Do の移し方と同じ）。
// 手順、保留の版、Google のエラーの扱いは Update.Do と同じである。
//
// 繰り返しの予定が無いか、繰り返しの予定でないときは apperr.ErrNotFound を、originalDate が回に当たらないか、その回を取り消したときは
// 入力のエラーを返す。その回をすでに変えたとき、親か回の記録に保留の版があるとき（CodeWritePending）は apperr.ErrConflict を返す。
// 回を読めないときは ErrGoogleUnavailable を包んだエラーを返す。ほかのエラーは Update.Do と同じである。
func (o ChangeOccurrence) Do(ctx context.Context, facilityID, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (scheduleview.Detail, error) {
	return o.update.changeOccurrence(ctx, facilityID, recurringScheduleID, originalDate, "", "", in)
}

// changeOccurrence は、ChangeOccurrence.Do と、展開した回への Update.Do の書き込みを行う。etag が空でなければ、親の予定を読み直して
// etag と比べ、違うか、回が親の予定を展開した回から変わっていれば、回に書かない（listedInstance）。
// listID は、変える回の一覧での ID で、空なら回の OccurrenceScheduleID にする。回を移した後に元のカレンダーに残った回では、
// 一覧での ID（DetachedOccurrenceScheduleID）を渡す。回の記録が移した予定を指すので、残った回をすでに変えた回とみなさないためである。
func (u Update) changeOccurrence(ctx context.Context, facilityID, recurringScheduleID string, originalDate civil.Date, listID, etag string,
	in schedule.SlotInput) (scheduleview.Detail, error) {
	if u.accounts == nil {
		return scheduleview.Detail{}, calendar.ErrNotConfigured
	}
	writer, err := u.accounts.Writer(ctx, facilityID)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	source, err := u.accounts.Source(ctx, facilityID)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	var parent parentEvent
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireGooglePrimary(ctx, u.locks, u.cutovers, facilityID); err != nil {
			return err
		}
		parent, err = lockParent(ctx, u.records, u.projections, u.staffRefs, u.calendars, facilityID, recurringScheduleID)
		return err
	})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	inst, err := listedInstance(ctx, source, u.projections, u.now, u.tx, parent, originalDate, etag)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	id := listID
	if id == "" {
		id = scheduleview.OccurrenceScheduleID(parent.cal.ID, parent.row.EventID, originalDate)
	}
	var c change
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireGooglePrimary(ctx, u.locks, u.cutovers, facilityID); err != nil {
			return err
		}
		p, err := lockParent(ctx, u.records, u.projections, u.staffRefs, u.calendars, facilityID, recurringScheduleID)
		if err != nil {
			return err
		}
		if err := requireUnchanged(ctx, u.records, u.projections, facilityID, id); err != nil {
			return err
		}
		c, err = u.beginOccurrence(ctx, facilityID, id, nil, p.cal, inst.ID, inst.ETag, p.row.StaffID, p.row.Visit, in)
		return err
	})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	return u.write(context.WithoutCancel(ctx), source, writer, c)
}
