package postgres

import (
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// 同期の状態のリポジトリが取る、事業所の正本のモード。
var (
	buddyPrimary  = []organization.SourceMode{organization.SourceBuddyPrimary}
	googlePrimary = []organization.SourceMode{organization.SourceGooglePrimary}
)

func TestCalendarSyncRepository(t *testing.T) {
	ctx := txContext(t)
	calendars := NewCalendarRepository(testDB)
	r := NewCalendarSyncRepository(testDB)
	const (
		calID      = "01M3TD000000000000000000C3"
		disabledID = "01M3TD000000000000000000C4"
	)
	for _, c := range []calendar.ExternalCalendar{
		{ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com"},
		{ID: disabledID, FacilityID: seedFacility, StaffID: seedHayashi, Provider: calendar.ProviderGoogle, CalendarID: "hayashi@example.com"},
	} {
		if err := calendars.Create(ctx, c); err != nil {
			t.Fatal(err)
		}
	}
	if err := calendars.Disable(ctx, disabledID); err != nil {
		t.Fatal(err)
	}

	claimed, err := r.Claim(ctx, 10, time.Minute, buddyPrimary)
	if err != nil || len(claimed) != 1 {
		t.Fatalf("Claim = %+v, %v", claimed, err)
	}
	st := claimed[0]
	if st.Calendar.ID != calID || st.Calendar.CalendarID != "mori@example.com" || st.Calendar.StaffID != seedMori ||
		st.SyncToken != "" || st.LastStatus != calendarsync.SyncNever || st.LockedUntil.IsZero() {
		t.Fatalf("取ったカレンダー = %+v", st)
	}
	if again, err := r.Claim(ctx, 10, time.Minute, buddyPrimary); err != nil || len(again) != 0 {
		t.Errorf("lease の間に取った: %+v, %v", again, err)
	}

	// ほかの処理が取り直したカレンダーには書かない
	stale := st
	stale.LockedUntil = st.LockedUntil.Add(-time.Second)
	if err := r.Finish(ctx, stale, calendarsync.SyncResult{SyncToken: "stale", Status: calendarsync.SyncSucceeded}); err != nil {
		t.Fatal(err)
	}
	if err := r.Finish(ctx, st, calendarsync.SyncResult{SyncToken: "t1", Status: calendarsync.SyncSucceeded}); err != nil {
		t.Fatal(err)
	}
	claimed, err = r.Claim(ctx, 10, time.Minute, buddyPrimary)
	if err != nil || len(claimed) != 1 || claimed[0].SyncToken != "t1" || claimed[0].LastStatus != calendarsync.SyncSucceeded {
		t.Fatalf("同期した後の Claim = %+v, %v", claimed, err)
	}

	code := calendarsync.SyncUnreadable
	if err := r.Finish(ctx, claimed[0], calendarsync.SyncResult{SyncToken: "t1", Status: calendarsync.SyncFailed, ErrorCode: &code, After: time.Hour}); err != nil {
		t.Fatal(err)
	}
	if again, err := r.Claim(ctx, 10, time.Minute, buddyPrimary); err != nil || len(again) != 0 {
		t.Errorf("読む時刻の前に取った: %+v, %v", again, err)
	}
}

// TestCalendarSyncForgetsTokenToReadAll は、空のトークンで同期の結果を書くと、トークンを消し、次の Claim がトークンを空で返す
// （全ての予定を読み直す）ことと、失敗の結果が最後の成功の時刻を進めないことを確認する。
// トークンが切れた（410）後の全件の読み直しが失敗したときに当たる。
func TestCalendarSyncForgetsTokenToReadAll(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(pgx.Tx)
	// 同期は、Google カレンダーを正本にする事業所のカレンダーを読む（ADR-0028）
	if _, err := tx.Exec(ctx, "UPDATE facilities SET source_mode = 'google_primary' WHERE id = $1", seedFacility); err != nil {
		t.Fatal(err)
	}
	const calID = "01M3TD000000000000000000C7"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com",
	}); err != nil {
		t.Fatal(err)
	}
	r := NewCalendarSyncRepository(testDB)
	claim := func() calendarsync.SyncState {
		t.Helper()
		if _, err := tx.Exec(ctx, "UPDATE calendar_sync_states SET next_sync_at = now() WHERE external_calendar_id = $1", calID); err != nil {
			t.Fatal(err)
		}
		claimed, err := r.Claim(ctx, 10, time.Minute, googlePrimary)
		if err != nil {
			t.Fatal(err)
		}
		i := slices.IndexFunc(claimed, func(s calendarsync.SyncState) bool { return s.Calendar.ID == calID })
		if i < 0 {
			t.Fatalf("Claim = %+v, want %s を取る", claimed, calID)
		}
		return claimed[i]
	}

	if err := r.Finish(ctx, claim(), calendarsync.SyncResult{SyncToken: "t1", Status: calendarsync.SyncSucceeded, Synced: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "UPDATE calendar_sync_states SET last_synced_at = now() - interval '2 hours' WHERE external_calendar_id = $1", calID); err != nil {
		t.Fatal(err)
	}
	code := calendarsync.SyncUnavailable
	if err := r.Finish(ctx, claim(), calendarsync.SyncResult{Status: calendarsync.SyncFailed, ErrorCode: &code}); err != nil {
		t.Fatal(err)
	}
	st := claim()
	if st.SyncToken != "" || st.LastStatus != calendarsync.SyncFailed || st.LastError == nil || *st.LastError != calendarsync.SyncUnavailable {
		t.Errorf("トークンを消した後の Claim = %+v, want 空のトークンと unavailable", st)
	}
	var tokenIsNull, keptSuccess bool
	if err := tx.QueryRow(ctx,
		"SELECT sync_token IS NULL, last_synced_at < now() - interval '1 hour' FROM calendar_sync_states WHERE external_calendar_id = $1", calID,
	).Scan(&tokenIsNull, &keptSuccess); err != nil {
		t.Fatal(err)
	}
	if !tokenIsNull || !keptSuccess {
		t.Errorf("同期の状態: sync_token IS NULL = %v, 最後の成功を進めていない = %v", tokenIsNull, keptSuccess)
	}
}
