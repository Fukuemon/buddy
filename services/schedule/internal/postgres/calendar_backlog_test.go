package postgres

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
)

// within は、d が want 以上で、want に 1 分を足した値より短いかを返す。トランザクションの now() は始めた時刻で止まるので、
// 少しの差を許す。
func within(d, want time.Duration) bool {
	return d >= want && d < want+time.Minute
}

func TestCalendarExportBacklog(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(pgx.Tx)
	r := NewCalendarExportRepository(testDB)
	if b, err := r.Backlog(ctx); err != nil || b.PendingCount != 0 || b.OldestAge != 0 {
		t.Fatalf("待ちが無いときの Backlog = %+v, %v", b, err)
	}

	const pendingID, retryID, conflictID = "01M3TD000000000000000000B0", "01M3TD000000000000000000B1", "01M3TD000000000000000000B2"
	if err := r.Enqueue(ctx, pendingID, calendar.Target{FacilityID: seedFacility, ScheduleID: seedConference}); err != nil {
		t.Fatal(err)
	}
	if err := r.Enqueue(ctx, retryID, calendar.Target{FacilityID: seedFacility, RecurringScheduleID: seedRecurring}); err != nil {
		t.Fatal(err)
	}
	// 確認が必要な待ちは、職員が選ぶまで書かないので数えない
	if err := r.Enqueue(ctx, conflictID, calendar.Target{FacilityID: seedFacility, ScheduleID: seedVisitSchedule}); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "UPDATE calendar_exports SET status = 'conflict', error_code = 'precondition_failed' WHERE id = $1", conflictID); err != nil {
		t.Fatal(err)
	}
	for id, age := range map[string]string{pendingID: "10 minutes", retryID: "1 hour", conflictID: "1 day"} {
		if _, err := tx.Exec(ctx, "UPDATE calendar_exports SET created_at = now() - $2::interval WHERE id = $1", id, age); err != nil {
			t.Fatal(err)
		}
	}
	// 書き直しを待つ待ち（書く時刻が先）も、書いていない待ちに数える
	if _, err := tx.Exec(ctx, "UPDATE calendar_exports SET next_attempt_at = now() + interval '5 minutes', attempts = 1 WHERE id = $1", retryID); err != nil {
		t.Fatal(err)
	}
	b, err := r.Backlog(ctx)
	if err != nil || b.PendingCount != 2 || !within(b.OldestAge, time.Hour) {
		t.Errorf("Backlog = %+v, %v", b, err)
	}
}

func TestCalendarSyncBacklog(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(pgx.Tx)
	calendars := NewCalendarRepository(testDB)
	r := NewCalendarSyncRepository(testDB)
	if b, err := r.Backlog(ctx, buddyPrimary); err != nil || b.OverdueCount != 0 || b.OldestSuccessAge != 0 {
		t.Fatalf("カレンダーが無いときの Backlog = %+v, %v", b, err)
	}

	const syncedID, neverID = "01M3TD000000000000000000B3", "01M3TD000000000000000000B4"
	for _, c := range []calendar.ExternalCalendar{
		{ID: syncedID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com"},
		{ID: neverID, FacilityID: seedFacility, StaffID: seedHayashi, Provider: calendar.ProviderGoogle, CalendarID: "hayashi@example.com"},
	} {
		if err := calendars.Create(ctx, c); err != nil {
			t.Fatal(err)
		}
	}
	claimed, err := r.Claim(ctx, 10, time.Minute, buddyPrimary)
	if err != nil || len(claimed) != 2 {
		t.Fatalf("Claim = %+v, %v", claimed, err)
	}
	for _, st := range claimed {
		if st.Calendar.ID == syncedID {
			if err := r.Finish(ctx, st, calendarsync.SyncResult{Status: calendarsync.SyncSucceeded, After: time.Hour}); err != nil {
				t.Fatal(err)
			}
		}
	}
	if _, err := tx.Exec(ctx, "UPDATE calendar_sync_states SET last_synced_at = now() - interval '2 hours' WHERE external_calendar_id = $1", syncedID); err != nil {
		t.Fatal(err)
	}
	// 1 回も成功していないカレンダーは、同期の状態の行を足した時刻から数える
	if _, err := tx.Exec(ctx, "UPDATE calendar_sync_states SET created_at = now() - interval '30 minutes' WHERE external_calendar_id = $1", neverID); err != nil {
		t.Fatal(err)
	}
	b, err := r.Backlog(ctx, buddyPrimary)
	if err != nil || b.OverdueCount != 1 || !within(b.OldestSuccessAge, 2*time.Hour) {
		t.Errorf("Backlog = %+v, %v", b, err)
	}
	// 外したカレンダーは数えない
	if err := calendars.Disable(ctx, syncedID); err != nil {
		t.Fatal(err)
	}
	b, err = r.Backlog(ctx, buddyPrimary)
	if err != nil || b.OverdueCount != 1 || !within(b.OldestSuccessAge, 30*time.Minute) {
		t.Errorf("外した後の Backlog = %+v, %v", b, err)
	}
}

// TestCalendarSyncHeldKeepsLastSuccess は、書き出しを待って同期を見送った回が、前の成功の状態を返しても、
// 最後の成功の時刻を進めないことを確認する。進めると、滞留の最後の成功からの時間が見送るたびに 0 に戻る。
func TestCalendarSyncHeldKeepsLastSuccess(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(pgx.Tx)
	calendars := NewCalendarRepository(testDB)
	r := NewCalendarSyncRepository(testDB)
	const calID = "01M3TD000000000000000000B5"
	if err := calendars.Create(ctx, calendar.ExternalCalendar{ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com"}); err != nil {
		t.Fatal(err)
	}
	claim := func() calendarsync.SyncState {
		t.Helper()
		claimed, err := r.Claim(ctx, 10, time.Minute, buddyPrimary)
		if err != nil || len(claimed) != 1 {
			t.Fatalf("Claim = %+v, %v", claimed, err)
		}
		return claimed[0]
	}
	if err := r.Finish(ctx, claim(), calendarsync.SyncResult{Status: calendarsync.SyncSucceeded, Synced: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "UPDATE calendar_sync_states SET last_synced_at = now() - interval '2 hours', next_sync_at = now() WHERE external_calendar_id = $1", calID); err != nil {
		t.Fatal(err)
	}
	// 書き出しを待って見送った回は、前の状態（succeeded）を返す
	if err := r.Finish(ctx, claim(), calendarsync.SyncResult{Status: calendarsync.SyncSucceeded}); err != nil {
		t.Fatal(err)
	}
	b, err := r.Backlog(ctx, buddyPrimary)
	if err != nil || !within(b.OldestSuccessAge, 2*time.Hour) {
		t.Errorf("見送った後の Backlog = %+v, %v, want 最後の成功から 2 時間", b, err)
	}
}
