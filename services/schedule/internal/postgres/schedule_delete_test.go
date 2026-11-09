package postgres

import (
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// TestScheduleDeleteInDB は、単発の予定の削除が、監査の記録を書き、予定の対応を監査の記録に付け替えてから、
// 予定の行と訪問の情報を消すことを確認する（ADR-0040）。終わっていない書き出しの待ちは削除の待ちに付け替わり、終わった待ちは外部キーで消える（#964）。
func TestScheduleDeleteInDB(t *testing.T) {
	ctx := txContext(t)
	schedules, calendars, exports := NewScheduleRepository(testDB), NewCalendarRepository(testDB), NewCalendarExportRepository(testDB)
	const (
		calID    = "01M3TD000000000000000000C1"
		linkID   = "01M3TD000000000000000000K1"
		exportID = "01M3TD000000000000000000X5"
		deleteID = "01M3TD000000000000000000X6"
		doneID   = "01M3TD000000000000000000X7"
		auditID  = "01M3TD000000000000000000D1"
	)
	cur, err := schedules.Get(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	infoID := *cur.VisitInfoID
	if err := calendars.Create(ctx, calendar.ExternalCalendar{ID: calID, FacilityID: seedFacility, StaffID: cur.StaffID, Provider: calendar.ProviderGoogle, CalendarID: "staff@example.com"}); err != nil {
		t.Fatal(err)
	}
	sid := seedVisitSchedule
	if err := calendars.CreateLink(ctx, calendar.EventLink{ID: linkID, FacilityID: seedFacility, ExternalCalendarID: calID, ExternalEventID: "ev1", ETag: `"1"`, ScheduleID: &sid}); err != nil {
		t.Fatal(err)
	}
	if err := exports.Enqueue(ctx, exportID, calendar.Target{FacilityID: seedFacility, ScheduleID: seedVisitSchedule}); err != nil {
		t.Fatal(err)
	}
	tx := ctx.Value(txKey{}).(pgx.Tx)
	// 終わっていない待ちは、外部で変わっていた確認が必要な待ちにし、終わった待ちを別に足す
	if _, err := tx.Exec(ctx, `UPDATE calendar_exports SET status = 'conflict', error_code = 'precondition_failed', attempts = 3, writing_calendar_id = $2 WHERE id = $1`, exportID, calID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO calendar_exports (id, facility_id, schedule_id, status, finished_at) VALUES ($1, $2, $3, 'succeeded', now())`,
		doneID, seedFacility, seedVisitSchedule); err != nil {
		t.Fatal(err)
	}

	d := schedule.Deletion{ID: auditID, FacilityID: seedFacility, ScheduleID: seedVisitSchedule, Date: cur.Date, StaffID: cur.StaffID, DeletedBy: seedMori}
	if err := schedules.Delete(ctx, d); err != nil {
		t.Fatal(err)
	}
	if _, err := schedules.Get(ctx, seedVisitSchedule); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("削除した予定の取得: err = %v, want ErrNotFound", err)
	}
	l, err := calendars.LinkByDeletedSchedule(ctx, seedVisitSchedule)
	if err != nil || l.ID != linkID || l.ScheduleID != nil {
		t.Errorf("削除した予定の対応 = %+v, %v, want 監査の記録を指して残る", l, err)
	}
	moved, err := exports.Get(ctx, exportID)
	if err != nil || moved.DeletedScheduleID != seedVisitSchedule || moved.ScheduleID != "" || moved.Status != calendar.ExportPending ||
		moved.Attempts != 0 || moved.ErrorCode != nil || moved.Revision != 2 || moved.WritingCalendarID != calID {
		t.Errorf("終わっていない待ち = %+v, %v, want 作ろうとしたカレンダーを持ったまま、pending の削除の待ちに付け替わる", moved, err)
	}
	if _, err := exports.Get(ctx, doneID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("終わった書き出しの待ち: err = %v, want 外部キーで消える", err)
	}
	if err := exports.Enqueue(ctx, deleteID, calendar.Target{FacilityID: seedFacility, DeletedScheduleID: seedVisitSchedule}); err != nil {
		t.Fatal(err)
	}
	if e, err := exports.Get(ctx, exportID); err != nil || e.Revision != 3 {
		t.Errorf("削除の待ちを積んだ後の待ち = %+v, %v, want 付け替えた待ちに積み直す", e, err)
	}
	if _, err := exports.Get(ctx, deleteID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("削除の待ちを別に足した: err = %v", err)
	}

	var infos int
	if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM visit_infos WHERE id = $1", infoID).Scan(&infos); err != nil {
		t.Fatal(err)
	}
	if infos != 0 {
		t.Error("削除した予定の訪問の情報が残っている")
	}
	var got schedule.Deletion
	var date time.Time
	if err := tx.QueryRow(ctx, `SELECT id, facility_id, schedule_id, date, staff_id, deleted_by FROM schedule_deletions WHERE id = $1`, auditID).
		Scan(&got.ID, &got.FacilityID, &got.ScheduleID, &date, &got.StaffID, &got.DeletedBy); err != nil {
		t.Fatal(err)
	}
	got.Date = civil.DateOf(date)
	if got != d {
		t.Errorf("監査の記録 = %+v, want %+v", got, d)
	}
	if err := schedules.Delete(ctx, schedule.Deletion{ID: "01M3TD000000000000000000D2", FacilityID: seedFacility, ScheduleID: seedVisitSchedule,
		Date: cur.Date, StaffID: cur.StaffID, DeletedBy: seedMori}); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("削除した予定の 2 度目の削除: err = %v, want ErrConflict", err)
	}
	if err := schedules.Create(ctx, schedule.Schedule{ID: seedVisitSchedule, Slot: schedule.Slot{FacilityID: seedFacility, StaffID: cur.StaffID, TypeID: seedNormalType,
		Date: cur.Date, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, Title: ptr("作り直し")}}); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("削除した ID での作成: err = %v, want ErrConflict", err)
	}
	if staffID, err := schedules.StaffOfDeleted(ctx, seedVisitSchedule); err != nil || staffID != cur.StaffID {
		t.Errorf("StaffOfDeleted = %q, %v, want %s", staffID, err, cur.StaffID)
	}
}

// TestRecurringDeleteOccurrenceInDB は、回の削除が除外する日と監査の記録を書き、同じ日の 2 度目を ErrConflict で拒むことを確認する。
func TestRecurringDeleteOccurrenceInDB(t *testing.T) {
	ctx := txContext(t)
	r := NewRecurringScheduleRepository(testDB)
	rs, err := r.Get(ctx, seedRecurring)
	if err != nil {
		t.Fatal(err)
	}
	day := civil.Date{Year: 2099, Month: 1, Day: 5}
	d := schedule.Deletion{ID: "01M3TD000000000000000000D3", FacilityID: seedFacility, RecurringScheduleID: seedRecurring, Date: day, StaffID: rs.StaffID, DeletedBy: seedMori}
	if err := r.DeleteOccurrence(ctx, d); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedRecurring)
	if err != nil || got.Version != rs.Version+1 || len(got.ExclusionDates) != len(rs.ExclusionDates)+1 {
		t.Errorf("回を削除した後 = %+v, %v", got, err)
	}
	d.ID = "01M3TD000000000000000000D4"
	if err := r.DeleteOccurrence(ctx, d); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("2 度目の回の削除: err = %v, want ErrConflict", err)
	}
	// 規則を書き換えると削除した日の除外が消え、新しい規則の回として同じ日をもう一度削除できる（ADR-0040 の 8）
	if err := r.RemoveUnreplacedExclusions(ctx, seedRecurring, day); err != nil {
		t.Fatal(err)
	}
	d.ID = "01M3TD000000000000000000D5"
	if err := r.DeleteOccurrence(ctx, d); err != nil {
		t.Errorf("規則を変えた後の同じ日の回の削除: err = %v", err)
	}
}
