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
// 応答の予定の ID は、変えた回の一覧での ID（scheduleview.ProjectedScheduleID）である。
// 訪問の情報は親の予定の記録のものを引き継ぎ、回で訪問の情報を変えたときだけ、回の一覧での ID の記録を足す。
// 手順、保留の版、Google のエラーの扱いは Update.Do と同じである。
//
// 繰り返しの予定が無いか、繰り返しの予定でないときは apperr.ErrNotFound を、originalDate が回に当たらないか、その回を取り消したときは入力のエラーを返す。
// その回をすでに変えたとき、予定の職員を替えるとき、親か回の記録に保留の版があるとき（CodeWritePending）は apperr.ErrConflict を返す。
// 回を読めないときは ErrGoogleUnavailable を包んだエラーを返す。ほかのエラーは Update.Do と同じである。
func (o ChangeOccurrence) Do(ctx context.Context, facilityID, recurringScheduleID string, originalDate civil.Date, in schedule.SlotInput) (scheduleview.Detail, error) {
	u := o.update
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
	inst, err := findInstance(ctx, source, parent.cal, parent.row.EventID, originalDate)
	if err != nil {
		return scheduleview.Detail{}, err
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
		if err := requireUnchanged(ctx, u.records, u.projections, facilityID, p.cal, inst.ID); err != nil {
			return err
		}
		id := scheduleview.ProjectedScheduleID(p.cal.ID, inst.ID)
		c, err = u.beginOccurrence(ctx, facilityID, id, nil, p.cal, inst.ID, inst.ETag, p.row.StaffID, p.row.Visit, in)
		return err
	})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	return u.write(context.WithoutCancel(ctx), source, writer, c)
}
