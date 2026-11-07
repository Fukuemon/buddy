package calendarwrite

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// requireGooglePrimary は、手順 1 の始めに、事業所 facilityID の行を共有のロックで読み、google_primary で open の切り替えが無いことを確認する。
// ロックはトランザクションが終わるまで、職員の状態とモードの切り替えを待たせる。トランザクションの中で呼ぶ。
func requireGooglePrimary(ctx context.Context, locks FacilityLock, cutovers Cutovers, facilityID string) error {
	f, err := locks.GetForShare(ctx, facilityID)
	if err != nil {
		return err
	}
	if f.SourceMode != organization.SourceGooglePrimary {
		return errNotGooglePrimary
	}
	open, err := cutovers.FindOpenCutover(ctx, facilityID)
	if err != nil {
		return err
	}
	if open != nil {
		return errCutoverOpen
	}
	return nil
}

// lockStoredEvent は、変えるか取り消す予定 id の記録を排他のロックで読み、予定の Projection の行を返す。
// 記録が無ければ（Google で作って buddy で変えていない予定）、rec は nil である。トランザクションの中で呼ぶ。
// 予定が無いか、記録がほかの事業所のものなら apperr.ErrNotFound を、保留の版がある記録には errWritePending を、
// 繰り返しの予定の親には errRecurring を、Google で取り消した予定には errEventNotFound を返す。例外の回の行は返す。
func lockStoredEvent(ctx context.Context, records RecordRepository, projections Projections, facilityID, id string) (*calendar.EventRecord, scheduleview.ProjectionDetail, error) {
	var rec *calendar.EventRecord
	r, err := records.GetForUpdate(ctx, id)
	switch {
	case err == nil:
		if r.FacilityID != facilityID {
			return nil, scheduleview.ProjectionDetail{}, apperr.ErrNotFound
		}
		if r.Pending != nil {
			return nil, scheduleview.ProjectionDetail{}, errWritePending
		}
		rec = &r
	case !errors.Is(err, apperr.ErrNotFound):
		return nil, scheduleview.ProjectionDetail{}, err
	}
	row, err := projections.GetBySchedule(ctx, facilityID, id)
	if err != nil {
		return nil, scheduleview.ProjectionDetail{}, err
	}
	switch {
	case row.IsParent():
		return nil, scheduleview.ProjectionDetail{}, errRecurring
	case row.Status != scheduleview.ProjectionConfirmed:
		return nil, scheduleview.ProjectionDetail{}, errEventNotFound
	}
	return rec, row, nil
}

// describe は、組み立てた予定 sc を、応答と予定の本文に使う名前付きの予定にする。訪問の情報は、sc の訪問の情報の名前を付ける。
func describe(ctx context.Context, staffNames kernel.Finder[staff.Detail], details VisitDetails, sc schedule.Schedule, typ schedule.Type) (scheduleview.Detail, error) {
	st, err := staffNames.Get(ctx, sc.StaffID)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	d := scheduleview.Detail{Schedule: sc, TypeName: typ.Name, StaffName: st.Username, Source: scheduleview.SourceGoogleCalendar}
	if err := useStoredVisit(ctx, details, &d, sc.VisitInfoID); err != nil {
		return scheduleview.Detail{}, err
	}
	return d, nil
}

// useStoredVisit は、予定 d の訪問の情報を、保存した訪問の情報 id にする。id が nil なら訪問の情報を外す。
func useStoredVisit(ctx context.Context, details VisitDetails, d *scheduleview.Detail, id *string) error {
	d.VisitInfoID, d.Visit = id, nil
	if id == nil {
		return nil
	}
	v, err := details.GetDetail(ctx, *id)
	if err != nil {
		return err
	}
	d.Visit = &v
	return nil
}

// visitInfoOf は、保存した訪問の情報 id を、割り振った職員と利用者の確認に使う形で読む。id が nil なら nil を返す。
func visitInfoOf(ctx context.Context, details VisitDetails, id *string) (*visit.Info, error) {
	if id == nil {
		return nil, nil
	}
	v, err := details.GetDetail(ctx, *id)
	if err != nil {
		return nil, err
	}
	return &visit.Info{ID: v.ID, PatientID: v.PatientID, AssignedStaffID: v.AssignedStaffID, CompanionID: v.CompanionID, ServiceCodeID: v.ServiceCodeID}, nil
}

// bodyOf は、予定 d を、版 version を置いた Google の予定の本文にする。
func bodyOf(d scheduleview.Detail, version int) calendar.EventBody {
	b := calendar.ScheduleBody(d)
	b.Private[calendar.PropVersion] = strconv.Itoa(version)
	return b
}

// resultOf は、Google に書いた予定 ev から応答の予定を作る。作成と更新の時刻は、Google で最後に変えた時刻にする。読めなければ now にする。
// 版は version で、記録を持たない回の書き込み（version が 0）では 1 にする。
func resultOf(d scheduleview.Detail, version int, ev calendar.Event, now time.Time) scheduleview.Detail {
	d.Version, d.ETag = max(version, 1), ev.ETag
	at := now
	if t, err := time.Parse(time.RFC3339, ev.Updated); err == nil {
		at = t
	}
	d.CreatedAt, d.UpdatedAt = at, at
	return d
}

// confirmPending は、予定 scheduleID の記録に版が version の保留の版がまだあれば、calendar.ConfirmPending で確定する。
// トランザクションの中で呼ぶ。
func confirmPending(ctx context.Context, records RecordRepository, visits VisitInfos, scheduleID string, version int) error {
	rec, ok, err := calendar.LockPending(ctx, records, scheduleID, version)
	if err != nil || !ok {
		return err
	}
	return calendar.ConfirmPending(ctx, records, visits, rec)
}

// rejectPending は、予定 scheduleID の記録に版が version の保留の版がまだあれば、calendar.RejectPending で消す（手順 4）。
// トランザクションの中で呼ぶ。
func rejectPending(ctx context.Context, records RecordRepository, visits VisitInfos, scheduleID string, version int) error {
	rec, ok, err := calendar.LockPending(ctx, records, scheduleID, version)
	if err != nil || !ok {
		return err
	}
	return calendar.RejectPending(ctx, records, visits, rec)
}

// markUnknown は、予定 scheduleID の記録に版が version の保留の版がまだあれば、「結果が分からない」にして残す（手順 5）。
// トランザクションの中で呼ぶ。
func markUnknown(ctx context.Context, records RecordRepository, scheduleID string, version int) error {
	rec, ok, err := calendar.LockPending(ctx, records, scheduleID, version)
	if err != nil || !ok {
		return err
	}
	rec.Pending.State = calendar.PendingUnknown
	return records.Update(ctx, rec)
}

// project は、カレンダー cal の Google の予定 ev を Projection の行に写す。取り消した単発の予定と親の予定は、取り消しの状態の行にする。
// 取り消した例外の回は、同期（calendarsync）と同じく ProjectionOf で、親の予定の ID と元の開始を持つ行にする。
func project(ctx context.Context, projections Projections, today civil.Date, cal calendar.ExternalCalendar, ev calendar.Event) error {
	if ev.Status == calendar.StatusCancelled && ev.RecurringEventID == "" {
		return projections.Put(ctx, calendar.CancelledProjectionOf(cal, ev, today))
	}
	p, err := calendar.ProjectionOf(cal, ev)
	if err != nil {
		// shortcut: 日時を読めない予定は写さず、同期（calendarsync）が写すか消すのに任せる。Google が日時の無い予定を返したら直す
		return nil
	}
	return projections.Put(ctx, p)
}

// readEvent は、カレンダー calendarID の予定 eventID を、CallTimeout で打ち切って Google から読む。
// 更新の時刻の無い取り消しの予定には、読み始めた時刻を入れる（calendar.StampCancellation）。時刻は、Google の更新の時刻と比べるので、
// 予定の API の now ではなく時計の時刻にする。
func readEvent(ctx context.Context, source calendar.EventSource, calendarID, eventID string) (calendar.Event, error) {
	readAt := time.Now()
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	defer cancel()
	ev, err := source.Event(callCtx, calendarID, eventID)
	if err != nil {
		return calendar.Event{}, err
	}
	return calendar.StampCancellation(ev, readAt), nil
}

// reproject は、Google で変わっていた予定を読み直し、Projection の行に写す（ADR-0029 の表の ErrEventChanged と ErrEventGone）。
// 読めなければ写さず、同期に任せる。Google で取り消されていれば、取り消しの状態の行にする。
func reproject(ctx context.Context, source calendar.EventSource, projections Projections, now func() time.Time, t tx.Transactor,
	cal calendar.ExternalCalendar, eventID string) error {
	ev, err := readEvent(ctx, source, cal.CalendarID, eventID)
	if err != nil {
		return nil
	}
	return t.WithinTx(ctx, func(ctx context.Context) error {
		return project(ctx, projections, civil.Today(now()), cal, ev)
	})
}

// writeError は、Google が書き込みを拒んだときの EventWriter のエラーを、ADR-0029 の表の応答のエラーにする。
func writeError(err error) error {
	switch {
	case errors.Is(err, calendar.ErrEventChanged):
		return errEventChanged
	case errors.Is(err, calendar.ErrEventGone), errors.Is(err, calendar.ErrEventNotFound):
		return errEventNotFound
	case errors.Is(err, calendar.ErrUnwritable):
		return errUnwritable
	case errors.Is(err, calendar.ErrEventRejected):
		return errEventRejected
	case errors.Is(err, calendar.ErrUnavailable):
		return fmt.Errorf("%w: %w", ErrGoogleUnavailable, err)
	}
	return err
}

// deleteVisit は、訪問の情報 id がどの予定と記録にも指されていなければ消す。id が nil なら何もしない。
func deleteVisit(ctx context.Context, visits VisitInfos, id *string) error {
	if id == nil {
		return nil
	}
	return visits.DeleteIfUnused(ctx, *id)
}
