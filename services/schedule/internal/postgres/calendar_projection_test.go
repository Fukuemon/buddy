package postgres

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
)

// projectionRow は、calendar_event_projections の 1 行の、テストが見る列である。
type projectionRow struct {
	FacilityID, StaffID, Status, Title, ETag string
	RecurringEventID, TimeZone               *string
	StartAt, OriginalStartAt, GoogleUpdated  *time.Time
	StartDate, EndDate, LastEndDate          *time.Time
	Recurrence                               []string
}

// projectionRows は、カレンダー calID の Projection の行を、Google の予定の ID ごとに返す。
func projectionRows(t *testing.T, ctx context.Context, calID string) map[string]projectionRow {
	t.Helper()
	tx := ctx.Value(txKey{}).(pgx.Tx)
	rows, err := tx.Query(ctx, `
		SELECT external_event_id, facility_id, staff_id, status, title, etag, recurring_event_id, time_zone,
		       start_at, original_start_at, google_updated_at, start_date, end_date, last_end_date, recurrence
		FROM calendar_event_projections WHERE external_calendar_id = $1`, calID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]projectionRow{}
	for rows.Next() {
		var id string
		var r projectionRow
		if err := rows.Scan(&id, &r.FacilityID, &r.StaffID, &r.Status, &r.Title, &r.ETag, &r.RecurringEventID, &r.TimeZone,
			&r.StartAt, &r.OriginalStartAt, &r.GoogleUpdated, &r.StartDate, &r.EndDate, &r.LastEndDate, &r.Recurrence); err != nil {
			t.Fatal(err)
		}
		out[id] = r
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

func timeAt(t *testing.T, s string) *time.Time {
	t.Helper()
	v, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatal(err)
	}
	return &v
}

func civilDate(y int, m time.Month, d int) *civil.Date { return &civil.Date{Year: y, Month: m, Day: d} }

func sameTime(got, want *time.Time) bool {
	return (got == nil) == (want == nil) && (got == nil || got.Equal(*want))
}

// TestCalendarProjectionRepository は、Projection の行を、カレンダーと Google の予定の ID の組で 1 つに書き直すことと、
// 予定と例外の回の削除、読み直しに無かった行の削除、保持する期間より前に終わった行の削除が、ほかのカレンダーの行を消さないことを確認する。
func TestCalendarProjectionRepository(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarProjectionRepository(testDB)
	const otherCal = "01M3TD000000000000000000C8"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: otherCal, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com",
	}); err != nil {
		t.Fatal(err)
	}
	base := scheduleview.Projection{
		ExternalCalendarID: seedOkadaCalendar, FacilityID: seedGoogleFacility, StaffID: seedOkada, Status: scheduleview.ProjectionConfirmed,
	}
	single := base
	single.EventID, single.Title, single.ETag = "single", "【訪看I2】見本 一郎", `"1"`
	single.Start.At, single.End.At = timeAt(t, "2099-11-04T10:00:00+09:00"), timeAt(t, "2099-11-04T10:30:00+09:00")
	single.GoogleUpdatedAt, single.LastEndDate = timeAt(t, "2099-10-30T08:00:00Z"), civilDate(2099, 11, 4)
	weekly := base
	weekly.EventID, weekly.Title, weekly.ETag, weekly.TimeZone = "weekly", "定例", `"2"`, calendar.TimeZone
	weekly.Start.At, weekly.End.At = timeAt(t, "2099-11-02T09:00:00+09:00"), timeAt(t, "2099-11-02T10:00:00+09:00")
	weekly.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;TZID=Asia/Tokyo:20991109T090000"}
	cancelled := base
	cancelled.EventID, cancelled.RecurringEventID, cancelled.Status, cancelled.ETag = "weekly_1116", "weekly", scheduleview.ProjectionCancelled, `"3"`
	cancelled.OriginalStart.At, cancelled.LastEndDate = timeAt(t, "2099-11-16T09:00:00+09:00"), civilDate(2099, 11, 16)
	allDay := base
	allDay.EventID, allDay.Title, allDay.ETag = "allday", "研修", `"4"`
	allDay.Start.Date, allDay.End.Date, allDay.LastEndDate = civilDate(2099, 11, 12), civilDate(2099, 11, 13), civilDate(2099, 11, 13)
	ended := base
	ended.EventID, ended.Title, ended.ETag = "ended", "終わった予定", `"5"`
	ended.Start.At, ended.End.At, ended.LastEndDate = timeAt(t, "2020-01-06T10:00:00+09:00"), timeAt(t, "2020-01-06T11:00:00+09:00"), civilDate(2020, 1, 6)
	other := single
	other.ExternalCalendarID, other.FacilityID, other.StaffID = otherCal, seedFacility, seedMori
	for _, p := range []scheduleview.Projection{single, weekly, cancelled, allDay, ended, other} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatalf("Put %s: %v", p.EventID, err)
		}
	}
	// 同じ予定を変えて書き直すと、行は増えない
	single.Title, single.ETag, single.GoogleUpdatedAt = "【訪看I2】見本 二葉", `"6"`, timeAt(t, "2099-10-31T08:00:00Z")
	if err := r.Put(ctx, single); err != nil {
		t.Fatal(err)
	}
	// Google の更新の時刻が行と同じか古い内容は、書き直さない
	for _, at := range []string{"2099-10-31T08:00:00Z", "2099-10-30T08:00:00Z"} {
		stale := single
		stale.Title, stale.ETag, stale.GoogleUpdatedAt = "古い内容", `"7"`, timeAt(t, at)
		if err := r.Put(ctx, stale); err != nil {
			t.Fatal(err)
		}
	}

	rows := projectionRows(t, ctx, seedOkadaCalendar)
	if len(rows) != 5 {
		t.Fatalf("行 = %+v, want 5 行", rows)
	}
	if got := rows["single"]; got.Title != "【訪看I2】見本 二葉" || got.ETag != `"6"` || got.FacilityID != seedGoogleFacility || got.StaffID != seedOkada ||
		got.Status != "confirmed" || !sameTime(got.StartAt, single.Start.At) || !sameTime(got.GoogleUpdated, single.GoogleUpdatedAt) ||
		got.RecurringEventID != nil || got.TimeZone != nil || got.LastEndDate == nil || civil.DateOf(*got.LastEndDate) != *single.LastEndDate {
		t.Errorf("書き直した単発の予定の行 = %+v", got)
	}
	if got := rows["weekly"]; !slices.Equal(got.Recurrence, weekly.Recurrence) || got.TimeZone == nil || *got.TimeZone != calendar.TimeZone || got.LastEndDate != nil {
		t.Errorf("繰り返しの親の予定の行 = %+v", got)
	}
	if got := rows["weekly_1116"]; got.Status != "cancelled" || got.RecurringEventID == nil || *got.RecurringEventID != "weekly" ||
		got.StartAt != nil || !sameTime(got.OriginalStartAt, cancelled.OriginalStart.At) || len(got.Recurrence) != 0 {
		t.Errorf("取り消した回の行 = %+v", got)
	}
	if got := rows["allday"]; got.StartAt != nil || got.StartDate == nil || civil.DateOf(*got.StartDate) != *allDay.Start.Date ||
		got.EndDate == nil || civil.DateOf(*got.EndDate) != *allDay.End.Date {
		t.Errorf("終日の予定の行 = %+v", got)
	}

	// 保持する期間より前に終わった行だけを消し、終わる日の無い行は残す
	if err := r.DeleteEndedBefore(ctx, seedOkadaCalendar, civil.Date{Year: 2026, Month: 9, Day: 1}); err != nil {
		t.Fatal(err)
	}
	if _, ok := projectionRows(t, ctx, seedOkadaCalendar)["ended"]; ok {
		t.Error("保持する期間より前に終わった行が残っている")
	}
	if _, ok := projectionRows(t, ctx, seedOkadaCalendar)["weekly"]; !ok {
		t.Error("終わりの無い繰り返しの行を消した")
	}
	// 親の予定を消すと、その例外の回の行も消す
	if err := r.Delete(ctx, seedOkadaCalendar, "weekly"); err != nil {
		t.Fatal(err)
	}
	if rows := projectionRows(t, ctx, seedOkadaCalendar); len(rows) != 2 {
		t.Errorf("親の予定を消した後の行 = %+v, want single と allday", rows)
	}
	// 読み直しに無かった行を消す
	if err := r.DeleteExcept(ctx, seedOkadaCalendar, []string{"allday"}); err != nil {
		t.Fatal(err)
	}
	if rows := projectionRows(t, ctx, seedOkadaCalendar); len(rows) != 1 || rows["allday"].Title != "研修" {
		t.Errorf("読み直しに無かった行を消した後の行 = %+v", rows)
	}
	if err := r.DeleteExcept(ctx, seedOkadaCalendar, nil); err != nil {
		t.Fatal(err)
	}
	if rows := projectionRows(t, ctx, seedOkadaCalendar); len(rows) != 0 {
		t.Errorf("読み直しに予定が無いときの行 = %+v", rows)
	}
	if rows := projectionRows(t, ctx, otherCal); len(rows) != 1 {
		t.Errorf("ほかのカレンダーの行 = %+v, want 消さない", rows)
	}

	// 取り消した単発の予定は、取り消しの状態の行に残し、後から届いた取り消す前の内容で戻さない
	gone := single
	gone.EventID, gone.GoogleUpdatedAt = "gone", timeAt(t, "2099-10-30T08:00:00Z")
	cancelledSingle := base
	cancelledSingle.EventID, cancelledSingle.Status, cancelledSingle.ETag = "gone", scheduleview.ProjectionCancelled, `"8"`
	cancelledSingle.GoogleUpdatedAt, cancelledSingle.LastEndDate = timeAt(t, "2099-10-31T08:00:00Z"), civilDate(2026, 11, 6)
	for _, p := range []scheduleview.Projection{gone, cancelledSingle, gone} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	// 親の予定の例外の回を、取り消した回の行にする。ほかの親の例外の回は変えない
	moved := base
	moved.EventID, moved.RecurringEventID, moved.Title, moved.ETag = "parent_1109", "parent", "動かした回", `"9"`
	moved.OriginalStart.At, moved.Start.At, moved.End.At = timeAt(t, "2099-11-09T09:00:00+09:00"), timeAt(t, "2099-11-09T14:00:00+09:00"), timeAt(t, "2099-11-09T15:00:00+09:00")
	moved.LastEndDate = civilDate(2099, 11, 9)
	keep := moved
	keep.EventID, keep.RecurringEventID = "other_1109", "other"
	for _, p := range []scheduleview.Projection{moved, keep} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.CancelOccurrences(ctx, seedOkadaCalendar, "parent"); err != nil {
		t.Fatal(err)
	}
	after := projectionRows(t, ctx, seedOkadaCalendar)
	if got := after["parent_1109"]; got.Status != "cancelled" || got.Title != "" || got.StartAt != nil || !sameTime(got.OriginalStartAt, moved.OriginalStart.At) ||
		got.LastEndDate == nil || civil.DateOf(*got.LastEndDate) != *moved.LastEndDate {
		t.Errorf("取り消した親の例外の回の行 = %+v", got)
	}
	if got := after["other_1109"]; got.Status != "confirmed" || got.Title != "動かした回" {
		t.Errorf("ほかの親の例外の回の行 = %+v, want 変えない", got)
	}
	if got := projectionRows(t, ctx, seedOkadaCalendar)["gone"]; got.Status != "cancelled" || got.Title != "" || got.StartAt != nil || got.RecurringEventID != nil {
		t.Errorf("取り消した単発の予定の行 = %+v, want 取り消しのまま", got)
	}
}

// TestCalendarSyncProjectsGooglePrimaryCalendar は、組み立てと同じく google_primary の事業所にだけ ProjectionApplier を渡した同期の処理が、
// シードの google_primary の事業所（岡田のカレンダー）の Google の予定を Projection に写し、2 回流しても行を重ねず、
// トークンが切れた（410）ときに読み直しに無かった行を消すことと、buddy_primary の事業所のカレンダーを読まないことを確認する。
func TestCalendarSyncProjectsGooglePrimaryCalendar(t *testing.T) {
	ctx := txContext(t)
	const okadaCal, moriCal = "aoi.okada@example.com", "mori@example.com"
	weekly := &calendarv3.Event{
		Id: "weekly", Status: "confirmed", Summary: "【訪看I2】見本 一郎", Etag: `"weekly"`,
		Start:      &calendarv3.EventDateTime{DateTime: "2099-11-02T09:00:00+09:00", TimeZone: calendar.TimeZone},
		End:        &calendarv3.EventDateTime{DateTime: "2099-11-02T09:30:00+09:00", TimeZone: calendar.TimeZone},
		Recurrence: []string{"RRULE:FREQ=WEEKLY;BYDAY=MO"},
	}
	ev := func(id, summary, start, end string) *calendarv3.Event {
		return &calendarv3.Event{Id: id, Status: "confirmed", Summary: summary, Etag: `"` + id + `"`,
			Start: &calendarv3.EventDateTime{DateTime: start}, End: &calendarv3.EventDateTime{DateTime: end}}
	}
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{
		okadaCal: {{ev("single", "担当者会議", "2099-11-04T13:00:00+09:00", "2099-11-04T14:00:00+09:00"), weekly}},
		moriCal:  {{ev("mori", "森の予定", "2099-11-04T13:00:00+09:00", "2099-11-04T14:00:00+09:00")}},
	}}
	// buddy_primary の事業所の森にもカレンダーを結び付ける
	const moriCalID = "01M3TD000000000000000000C9"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: moriCalID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: moriCal,
	}); err != nil {
		t.Fatal(err)
	}
	source := gcal.NewReader(gcaltest.Start(t, srv))
	var sources []string
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncer := calendarsync.NewSyncer(calendarsync.SyncerDeps{
		Syncs: NewCalendarSyncRepository(testDB), Calendars: NewCalendarRepository(testDB), Staff: NewStaffRefRepository(testDB),
		Locks: NewFacilityRepository(testDB),
		Sources: func(_ context.Context, facilityID string) (calendar.EventSource, error) {
			sources = append(sources, facilityID)
			return source, nil
		},
	}, calendarsync.Appliers{
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(NewCalendarProjectionRepository(testDB), NewCalendarEventRecordRepository(testDB), NewVisitInfoRepository(testDB), log),
	}, NewTransactor(testDB), 0, log)
	sync := func() {
		t.Helper()
		if _, err := syncer.SyncDue(ctx); err != nil {
			t.Fatal(err)
		}
	}
	sync()
	sync()

	rows := projectionRows(t, ctx, seedOkadaCalendar)
	if len(rows) != 2 || rows["single"].Title != "担当者会議" || rows["single"].StaffID != seedOkada || rows["single"].FacilityID != seedGoogleFacility ||
		len(rows["weekly"].Recurrence) != 1 {
		t.Fatalf("2 回流した後の行 = %+v, want single と weekly の 2 行", rows)
	}
	if len(projectionRows(t, ctx, moriCalID)) != 0 || slices.Contains(sources, seedFacility) {
		t.Errorf("buddy_primary の事業所のカレンダーを読んだ: 引いた事業所 %v", sources)
	}

	// 職員が Google カレンダーで、予定を変え、繰り返しの 11-09 の回を取り消した
	srv.Edit(okadaCal, "single", func(e *calendarv3.Event) { e.Summary = "担当者会議（変更）" })
	srv.Put(okadaCal, &calendarv3.Event{
		Id: "weekly_1109", Status: "cancelled", RecurringEventId: "weekly",
		OriginalStartTime: &calendarv3.EventDateTime{DateTime: "2099-11-09T09:00:00+09:00"},
	})
	sync()
	rows = projectionRows(t, ctx, seedOkadaCalendar)
	if rows["single"].Title != "担当者会議（変更）" || rows["weekly_1109"].Status != "cancelled" || len(rows) != 3 {
		t.Errorf("変えた後の行 = %+v", rows)
	}

	// 増分で取り消しを取りこぼした行は、トークンが切れて読み直すと消える
	tx := ctx.Value(txKey{}).(pgx.Tx)
	if _, err := tx.Exec(ctx, `
		INSERT INTO calendar_event_projections (external_calendar_id, external_event_id, facility_id, staff_id, status, title, start_at, end_at, etag)
		VALUES ($1, 'missed', $2, $3, 'confirmed', '取りこぼした予定', now(), now() + interval '1 hour', '"missed"')`,
		seedOkadaCalendar, seedGoogleFacility, seedOkada); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "UPDATE calendar_sync_states SET next_sync_at = now() WHERE external_calendar_id = $1", seedOkadaCalendar); err != nil {
		t.Fatal(err)
	}
	srv.ExpireSyncTokens()
	sync()
	rows = projectionRows(t, ctx, seedOkadaCalendar)
	if _, ok := rows["missed"]; ok || len(rows) != 3 {
		t.Errorf("読み直した後の行 = %+v, want 取りこぼした行を消した 3 行", rows)
	}
	var status string
	var synced bool
	if err := tx.QueryRow(ctx, "SELECT last_status, last_synced_at IS NOT NULL FROM calendar_sync_states WHERE external_calendar_id = $1",
		seedOkadaCalendar).Scan(&status, &synced); err != nil {
		t.Fatal(err)
	}
	if status != string(calendarsync.SyncSucceeded) || !synced {
		t.Errorf("同期の状態 = %s, 成功の時刻 %v", status, synced)
	}
}

// TestCalendarSyncClaimsByMode は、同期の状態のリポジトリが、事業所の正本のモードが渡したモードにあるカレンダーだけを取り、
// 滞留も同じモードのカレンダーだけで数えることを確認する。
func TestCalendarSyncClaimsByMode(t *testing.T) {
	ctx := txContext(t)
	const moriCalID = "01M3TD000000000000000000CA"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: moriCalID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com",
	}); err != nil {
		t.Fatal(err)
	}
	r := NewCalendarSyncRepository(testDB)
	ids := func(states []calendarsync.SyncState) []string {
		out := make([]string, len(states))
		for i, s := range states {
			out[i] = s.Calendar.ID
		}
		slices.Sort(out)
		return out
	}
	// 同期の状態の行を先に作る。行はモードによらず、外していない全てのカレンダーに足す
	if _, err := r.Claim(ctx, 0, time.Minute, nil); err != nil {
		t.Fatal(err)
	}
	if b, err := r.Backlog(ctx, googlePrimary); err != nil || b.OverdueCount != 2 {
		t.Errorf("google_primary の Backlog = %+v, %v, want 岡田と石田のカレンダーの 2 件", b, err)
	}
	if b, err := r.Backlog(ctx, buddyPrimary); err != nil || b.OverdueCount != 1 {
		t.Errorf("buddy_primary の Backlog = %+v, %v, want 森のカレンダーの 1 件", b, err)
	}
	if b, err := r.Backlog(ctx, nil); err != nil || b.OverdueCount != 0 {
		t.Errorf("モードを渡さない Backlog = %+v, %v, want 0 件", b, err)
	}
	claimed, err := r.Claim(ctx, 10, time.Minute, googlePrimary)
	if err != nil || !slices.Equal(ids(claimed), []string{seedIshidaCalendar, seedOkadaCalendar}) {
		t.Fatalf("google_primary の Claim = %v, %v, want 石田と岡田のカレンダーだけ", ids(claimed), err)
	}
	okada := slices.IndexFunc(claimed, func(s calendarsync.SyncState) bool { return s.Calendar.ID == seedOkadaCalendar })
	if st := claimed[okada]; st.Calendar.FacilityID != seedGoogleFacility || st.Calendar.StaffID != seedOkada || st.Calendar.CalendarID != "aoi.okada@example.com" {
		t.Errorf("取った岡田のカレンダー = %+v", st.Calendar)
	}
	if claimed, err := r.Claim(ctx, 10, time.Minute, nil); err != nil || len(claimed) != 0 {
		t.Errorf("モードを渡さない Claim = %v, %v, want 取らない", ids(claimed), err)
	}
	if claimed, err := r.Claim(ctx, 10, time.Minute, buddyPrimary); err != nil || !slices.Equal(ids(claimed), []string{moriCalID}) {
		t.Errorf("buddy_primary の Claim = %v, %v, want 森のカレンダーだけ", ids(claimed), err)
	}
}

// TestCalendarProjectionRepositoryTimeUnreadable は、日時を読めない予定の行を、読めた方の日時だけで書いて TimeUnreadable のまま読み、
// 親を取り消すと例外の回の印を外すことと、日時を読めない予定でない確定の行は、開始が無いと書けないことを確認する（#672）。
func TestCalendarProjectionRepositoryTimeUnreadable(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarProjectionRepository(testDB)
	base := scheduleview.Projection{
		ExternalCalendarID: seedOkadaCalendar, FacilityID: seedGoogleFacility, StaffID: seedOkada, Status: scheduleview.ProjectionConfirmed,
		Title: "会議", TimeUnreadable: true,
	}
	endOnly := base
	endOnly.EventID, endOnly.ETag = "endonly", `"1"`
	endOnly.End.At, endOnly.LastEndDate = timeAt(t, "2099-11-04T11:00:00+09:00"), civilDate(2099, 11, 4)
	neither := base
	neither.EventID, neither.ETag = "neither", `"2"`
	occurrence := base
	occurrence.EventID, occurrence.ETag, occurrence.RecurringEventID = "weekly_1104", `"3"`, "weekly"
	occurrence.OriginalStart.At, occurrence.LastEndDate = timeAt(t, "2099-11-04T10:00:00+09:00"), civilDate(2099, 11, 4)
	for _, p := range []scheduleview.Projection{endOnly, neither, occurrence} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatalf("Put %s: %v", p.EventID, err)
		}
	}
	if err := r.CancelOccurrences(ctx, seedOkadaCalendar, "weekly"); err != nil {
		t.Fatal(err)
	}
	got, err := r.ListByFacility(ctx, seedGoogleFacility, civil.Date{Year: 2099, Month: 1, Day: 1})
	if err != nil {
		t.Fatal(err)
	}
	rows := map[string]scheduleview.Projection{}
	for _, p := range got {
		rows[p.EventID] = p.Projection
	}
	if p := rows["endonly"]; !p.TimeUnreadable || p.Start != (scheduleview.ProjectionTime{}) || !sameTime(p.End.At, endOnly.End.At) {
		t.Errorf("終了だけを読めた予定の行 = %+v", p)
	}
	if p := rows["neither"]; !p.TimeUnreadable || p.Start != (scheduleview.ProjectionTime{}) || p.End != (scheduleview.ProjectionTime{}) || p.LastEndDate != nil {
		t.Errorf("開始も終了も読めない予定の行 = %+v", p)
	}
	if p := rows["weekly_1104"]; p.Status != scheduleview.ProjectionCancelled || p.TimeUnreadable {
		t.Errorf("親を取り消した、日時を読めない例外の回の行 = %+v, want 取り消した回で TimeUnreadable は false", p)
	}

	broken := neither
	broken.EventID, broken.TimeUnreadable = "broken", false
	if err := r.Put(txContext(t), broken); err == nil {
		t.Error("開始と終了の無い確定の行を書けた")
	}
}

// TestCalendarProjectionRepositoryListByFacility は、予定の表示の読み出しが、事業所の外していないカレンダーの行を職員の名前を付けて読み、
// from より前に終わった行とほかの事業所の行と外したカレンダーの行を返さないことと、カレンダーの同期の状況を読むことを確認する。
func TestCalendarProjectionRepositoryListByFacility(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarProjectionRepository(testDB)
	const otherCal = "01M3TD000000000000000000CA"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: otherCal, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com",
	}); err != nil {
		t.Fatal(err)
	}
	base := scheduleview.Projection{
		ExternalCalendarID: seedOkadaCalendar, FacilityID: seedGoogleFacility, StaffID: seedOkada, Status: scheduleview.ProjectionConfirmed,
	}
	single := base
	single.EventID, single.Title, single.ETag = "single", "担当者会議", `"1"`
	single.Start.At, single.End.At = timeAt(t, "2099-11-04T10:00:00+09:00"), timeAt(t, "2099-11-04T10:30:00+09:00")
	single.LastEndDate = civilDate(2099, 11, 4)
	weekly := base
	weekly.EventID, weekly.Title, weekly.ETag, weekly.TimeZone = "weekly", "定例", `"2"`, calendar.TimeZone
	weekly.Start.At, weekly.End.At = timeAt(t, "2099-11-02T09:00:00+09:00"), timeAt(t, "2099-11-02T10:00:00+09:00")
	weekly.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=MO"}
	moved := base
	moved.EventID, moved.RecurringEventID, moved.Title, moved.ETag = "weekly_1109", "weekly", "定例（変更）", `"3"`
	moved.OriginalStart.At, moved.Start.At, moved.End.At = timeAt(t, "2099-11-09T09:00:00+09:00"), timeAt(t, "2099-11-10T09:00:00+09:00"), timeAt(t, "2099-11-10T10:00:00+09:00")
	moved.LastEndDate = civilDate(2099, 11, 10)
	ended := base
	ended.EventID, ended.Title, ended.ETag = "ended", "終わった予定", `"4"`
	ended.Start.At, ended.End.At, ended.LastEndDate = timeAt(t, "2020-01-06T10:00:00+09:00"), timeAt(t, "2020-01-06T11:00:00+09:00"), civilDate(2020, 1, 6)
	other := single
	other.ExternalCalendarID, other.FacilityID, other.StaffID = otherCal, seedFacility, seedMori
	for _, p := range []scheduleview.Projection{single, weekly, moved, ended, other} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatalf("Put %s: %v", p.EventID, err)
		}
	}

	got, err := r.ListByFacility(ctx, seedGoogleFacility, civil.Date{Year: 2099, Month: 1, Day: 1})
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, p := range got {
		ids = append(ids, p.EventID)
		if p.StaffName != "岡田 葵" || p.FacilityID != seedGoogleFacility {
			t.Errorf("%s: 職員の名前 = %q, 事業所 = %s", p.EventID, p.StaffName, p.FacilityID)
		}
	}
	if want := []string{"single", "weekly", "weekly_1109"}; !slices.Equal(ids, want) {
		t.Fatalf("行 = %v, want %v", ids, want)
	}
	if m := got[2]; m.RecurringEventID != "weekly" || !sameTime(m.OriginalStart.At, moved.OriginalStart.At) || !sameTime(m.Start.At, moved.Start.At) ||
		m.LastEndDate == nil || *m.LastEndDate != *moved.LastEndDate || m.ProjectedAt.IsZero() {
		t.Errorf("変えた回の行 = %+v", m)
	}
	if w := got[1]; !slices.Equal(w.Recurrence, weekly.Recurrence) || w.TimeZone != calendar.TimeZone || w.LastEndDate != nil {
		t.Errorf("繰り返しの親の行 = %+v", w)
	}

	syncs, err := r.ListSyncsByFacility(ctx, seedGoogleFacility)
	if err != nil {
		t.Fatal(err)
	}
	if len(syncs) != 1 || syncs[0].ExternalCalendarID != seedOkadaCalendar || syncs[0].StaffName != "岡田 葵" {
		t.Fatalf("同期の状況 = %+v", syncs)
	}
	tx := ctx.Value(txKey{}).(pgx.Tx)
	if _, err := tx.Exec(ctx, `
		INSERT INTO calendar_sync_states (external_calendar_id, facility_id, last_status, last_error, last_synced_at)
		VALUES ($1, $2, 'failed', 'unavailable', '2099-11-01T00:00:00Z')
		ON CONFLICT (external_calendar_id) DO UPDATE SET last_status = 'failed', last_error = 'unavailable', last_synced_at = '2099-11-01T00:00:00Z'`,
		seedOkadaCalendar, seedGoogleFacility); err != nil {
		t.Fatal(err)
	}
	syncs, err = r.ListSyncsByFacility(ctx, seedGoogleFacility)
	if err != nil {
		t.Fatal(err)
	}
	if s := syncs[0]; s.LastStatus != scheduleview.SyncFailed || s.LastError == nil || *s.LastError != "unavailable" ||
		!sameTime(s.LastSucceededAt, timeAt(t, "2099-11-01T00:00:00Z")) {
		t.Errorf("失敗した同期の状況 = %+v", s)
	}

	// 外したカレンダー（退職した職員のカレンダーを含む）の行と同期の状況は返さない
	if err := NewCalendarRepository(testDB).Disable(ctx, seedOkadaCalendar); err != nil {
		t.Fatal(err)
	}
	if got, err := r.ListByFacility(ctx, seedGoogleFacility, civil.Date{Year: 2099, Month: 1, Day: 1}); err != nil || len(got) != 0 {
		t.Errorf("外したカレンダーの行 = %+v, err = %v", got, err)
	}
	if syncs, err := r.ListSyncsByFacility(ctx, seedGoogleFacility); err != nil || len(syncs) != 0 {
		t.Errorf("外したカレンダーの同期の状況 = %+v, err = %v", syncs, err)
	}
}

// TestProjectedScheduleIDMatchesGo は、DB の関数 projected_schedule_id と detached_schedule_id が、scheduleview.ProjectedScheduleID と
// scheduleview.DetachedScheduleID と同じ値を返すことを確認する。
func TestProjectedScheduleIDMatchesGo(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	for _, in := range [][2]string{
		{seedOkadaCalendar, "single"},
		{seedOkadaCalendar, "4bq1t2f8gqv0k7rjtusk3jp8f0"},
		{"01M3TD000000000000000000CA", "予定_1"},
		{"", ""},
	} {
		var projected, detached string
		if err := testDB.QueryRow(ctx, "SELECT projected_schedule_id($1, $2), detached_schedule_id($1, $2)", in[0], in[1]).Scan(&projected, &detached); err != nil {
			t.Fatal(err)
		}
		if want := scheduleview.ProjectedScheduleID(in[0], in[1]); projected != want {
			t.Errorf("projected_schedule_id(%q, %q) = %s, want %s", in[0], in[1], projected, want)
		}
		if want := scheduleview.DetachedScheduleID(in[0], in[1]); detached != want || detached == projected {
			t.Errorf("detached_schedule_id(%q, %q) = %s, want %s", in[0], in[1], detached, want)
		}
	}
}

// TestOccurrenceScheduleIDMatchesGo は、DB の関数 occurrence_schedule_id が、元の開始の時刻（Asia/Tokyo の日付）と終日の元の日付のどちらでも、
// scheduleview.OccurrenceScheduleID と同じ値を返し、元の開始が無ければ NULL を返すことを確認する。
func TestOccurrenceScheduleIDMatchesGo(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	day := civil.Date{Year: 2026, Month: 10, Day: 29}
	at := time.Date(2026, 10, 29, 0, 30, 0, 0, calendar.Tokyo)
	want := scheduleview.OccurrenceScheduleID(seedOkadaCalendar, "series", day)
	var byTime, byDate string
	var none *string
	if err := testDB.QueryRow(ctx, "SELECT occurrence_schedule_id($1, $2, $3, NULL), occurrence_schedule_id($1, $2, NULL, $4), occurrence_schedule_id($1, $2, NULL, NULL)",
		seedOkadaCalendar, "series", at, day.Time()).Scan(&byTime, &byDate, &none); err != nil {
		t.Fatal(err)
	}
	if byTime != want || byDate != want || none != nil {
		t.Errorf("occurrence_schedule_id = %s, %s, %v, want %s, %s, NULL", byTime, byDate, none, want, want)
	}
	var detached string
	if err := testDB.QueryRow(ctx, "SELECT detached_occurrence_schedule_id($1, $2, $3, NULL)", seedOkadaCalendar, "series", at).Scan(&detached); err != nil {
		t.Fatal(err)
	}
	if want := scheduleview.DetachedOccurrenceScheduleID(seedOkadaCalendar, "series", day); detached != want || detached == byTime {
		t.Errorf("detached_occurrence_schedule_id = %s, want %s", detached, want)
	}
}

// TestCalendarProjectionRepositoryDetachedOccurrenceID は、回を移した後に元のカレンダーに残った例外の回の行（記録を持たず、
// occurrence_schedule_id が移した予定の記録の主キーと重なる行）に、一覧と 1 件の読み出しが detached_occurrence_schedule_id を使い、
// access がその ID の事業所を引けることを確認する。記録の主キーの ID は、移した予定を指す。
func TestCalendarProjectionRepositoryDetachedOccurrenceID(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarProjectionRepository(testDB)
	original := timeAt(t, "2099-11-04T10:00:00+09:00")
	left := scheduleview.Projection{
		ExternalCalendarID: seedOkadaCalendar, EventID: "series_20991104T010000Z", FacilityID: seedGoogleFacility, StaffID: seedOkada,
		RecurringEventID: "series", OriginalStart: scheduleview.ProjectionTime{At: original}, Status: scheduleview.ProjectionConfirmed,
		Title: "担当者会議", ETag: `"1"`, Start: scheduleview.ProjectionTime{At: original},
		End: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:30:00+09:00")}, LastEndDate: civilDate(2099, 11, 4),
	}
	moved := left
	moved.EventID, moved.RecurringEventID, moved.OriginalStart = "moved_single", "", scheduleview.ProjectionTime{}
	for _, p := range []scheduleview.Projection{left, moved} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	day := civil.Date{Year: 2099, Month: 11, Day: 4}
	occID := scheduleview.OccurrenceScheduleID(seedOkadaCalendar, "series", day)
	if err := NewCalendarEventRecordRepository(testDB).Create(ctx, calendar.EventRecord{
		ScheduleID: occID, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: moved.EventID, Version: 1,
	}); err != nil {
		t.Fatal(err)
	}
	detachedID := scheduleview.DetachedOccurrenceScheduleID(seedOkadaCalendar, "series", day)

	rows, err := r.ListByFacility(ctx, seedGoogleFacility, civil.Date{Year: 2099, Month: 1, Day: 1})
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]string{}
	for _, p := range rows {
		ids[p.EventID] = p.ScheduleID
	}
	if ids[left.EventID] != detachedID || ids[moved.EventID] != occID {
		t.Errorf("一覧の予定の ID = %v, want 残った回 %s、移した予定 %s", ids, detachedID, occID)
	}
	if got, err := r.GetBySchedule(ctx, seedGoogleFacility, detachedID); err != nil || got.EventID != left.EventID || got.ScheduleID != detachedID {
		t.Errorf("残った回の 1 件 = %+v, err = %v", got, err)
	}
	if got, err := r.GetBySchedule(ctx, seedGoogleFacility, occID); err != nil || got.EventID != moved.EventID {
		t.Errorf("移した予定の 1 件 = %+v, err = %v", got, err)
	}
	if f, err := NewScheduleRepository(testDB).GetFacilityID(ctx, detachedID); err != nil || f != seedGoogleFacility {
		t.Errorf("GetFacilityID(%s) = %s, %v, want %s", detachedID, f, err, seedGoogleFacility)
	}
	if got, err := r.ListRecordedEvents(ctx, seedGoogleFacility, []string{occID, detachedID}); err != nil ||
		!reflect.DeepEqual(got, map[string]scheduleview.RecordedEvent{occID: {ExternalCalendarID: seedOkadaCalendar, ExternalEventID: moved.EventID}}) {
		t.Errorf("ListRecordedEvents = %v, %v, want 記録の主キーの %s だけ", got, err, occID)
	}
	if got, err := r.ListRecordedEvents(ctx, seedFacility, []string{occID}); err != nil || len(got) != 0 {
		t.Errorf("ほかの事業所の ListRecordedEvents = %v, %v, want 空", got, err)
	}
	pendingID := scheduleview.OccurrenceScheduleID(seedOkadaCalendar, "series", civil.Date{Year: 2099, Month: 11, Day: 11})
	if err := NewCalendarEventRecordRepository(testDB).Create(ctx, calendar.EventRecord{
		ScheduleID: pendingID, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: "series_20991111T010000Z",
		Pending: &calendar.PendingWrite{Version: 1, State: calendar.PendingUnknown, Deadline: time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)},
	}); err != nil {
		t.Fatal(err)
	}
	if got, err := r.ListRecordedEvents(ctx, seedGoogleFacility, []string{pendingID}); err != nil || len(got) != 0 {
		t.Errorf("保留の版だけの記録の ListRecordedEvents = %v, %v, want 空", got, err)
	}
	own := left
	own.EventID, own.OriginalStart.At = "series_20991118T010000Z", timeAt(t, "2099-11-18T10:00:00+09:00")
	if err := r.Put(ctx, own); err != nil {
		t.Fatal(err)
	}
	ownID := scheduleview.OccurrenceScheduleID(seedOkadaCalendar, "series", civil.Date{Year: 2099, Month: 11, Day: 18})
	noRowID := scheduleview.OccurrenceScheduleID(seedOkadaCalendar, "series", civil.Date{Year: 2099, Month: 11, Day: 25})
	for _, rec := range []calendar.EventRecord{
		{ScheduleID: ownID, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: own.EventID, Version: 1},
		{ScheduleID: noRowID, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: "series_20991125T010000Z", Version: 1},
	} {
		if err := NewCalendarEventRecordRepository(testDB).Create(ctx, rec); err != nil {
			t.Fatal(err)
		}
	}
	got, err := r.ListRecordedEvents(ctx, seedGoogleFacility, []string{ownID, noRowID})
	if want := map[string]scheduleview.RecordedEvent{ownID: {ExternalCalendarID: seedOkadaCalendar, ExternalEventID: own.EventID, RecurringEventID: "series"}}; err != nil || !reflect.DeepEqual(got, want) {
		t.Errorf("例外の回を指す記録と行の無い記録の ListRecordedEvents = %v, %v, want %v", got, err, want)
	}
}

// TestCalendarProjectionRepositoryGetBySchedule は、記録のある予定を記録の予定の ID で、記録の無い予定を一覧での ID で引けることと、
// 一覧が記録の予定の ID を返すこと、access が両方の ID の事業所を引けることを確認する。
func TestCalendarProjectionRepositoryGetBySchedule(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarProjectionRepository(testDB)
	base := scheduleview.Projection{
		ExternalCalendarID: seedOkadaCalendar, FacilityID: seedGoogleFacility, StaffID: seedOkada, Status: scheduleview.ProjectionConfirmed,
		Title: "担当者会議", ETag: `"1"`, Start: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:00:00+09:00")},
		End: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:30:00+09:00")}, LastEndDate: civilDate(2099, 11, 4),
	}
	google, written := base, base
	google.EventID, written.EventID = "made_in_google", "written_by_buddy"
	for _, p := range []scheduleview.Projection{google, written} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	const recordID = "01M3TD000000000000000000S7"
	if err := NewCalendarEventRecordRepository(testDB).Create(ctx, calendar.EventRecord{
		ScheduleID: recordID, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: written.EventID, Version: 1,
	}); err != nil {
		t.Fatal(err)
	}
	googleID := scheduleview.ProjectedScheduleID(seedOkadaCalendar, google.EventID)

	got, err := r.GetBySchedule(ctx, seedGoogleFacility, googleID)
	if err != nil || got.EventID != google.EventID || got.ScheduleID != googleID || got.StaffName != "岡田 葵" {
		t.Errorf("記録の無い予定 = %+v, err = %v", got, err)
	}
	got, err = r.GetBySchedule(ctx, seedGoogleFacility, recordID)
	if err != nil || got.EventID != written.EventID || got.ScheduleID != recordID {
		t.Errorf("記録のある予定 = %+v, err = %v", got, err)
	}
	if _, err := r.GetBySchedule(ctx, seedGoogleFacility, scheduleview.ProjectedScheduleID(seedOkadaCalendar, written.EventID)); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("記録のある予定を一覧での ID で引いた: err = %v, want ErrNotFound", err)
	}
	if _, err := r.GetBySchedule(ctx, seedFacility, recordID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("ほかの事業所で引いた: err = %v, want ErrNotFound", err)
	}

	rows, err := r.ListByFacility(ctx, seedGoogleFacility, civil.Date{Year: 2099, Month: 1, Day: 1})
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]string{}
	for _, p := range rows {
		ids[p.EventID] = p.ScheduleID
	}
	if ids[google.EventID] != googleID || ids[written.EventID] != recordID {
		t.Errorf("一覧の記録の予定の ID = %v", ids)
	}

	schedules := NewScheduleRepository(testDB)
	for _, id := range []string{recordID, googleID} {
		if f, err := schedules.GetFacilityID(ctx, id); err != nil || f != seedGoogleFacility {
			t.Errorf("GetFacilityID(%s) = %s, %v, want %s", id, f, err, seedGoogleFacility)
		}
	}
}

// TestCalendarProjectionRepositoryDetachedID は、Google で作った予定を移した後に前のカレンダーに残った予定（記録を持たず、
// 一覧での ID が移した予定の記録の主キーと重なる予定）に、一覧と 1 件の読み出しが detached_schedule_id を使うことを確認する。
func TestCalendarProjectionRepositoryDetachedID(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarProjectionRepository(testDB)
	base := scheduleview.Projection{
		ExternalCalendarID: seedOkadaCalendar, FacilityID: seedGoogleFacility, StaffID: seedOkada, Status: scheduleview.ProjectionConfirmed,
		Title: "担当者会議", ETag: `"1"`, Start: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:00:00+09:00")},
		End: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:30:00+09:00")}, LastEndDate: civilDate(2099, 11, 4),
	}
	left, moved := base, base
	left.EventID, moved.EventID = "left_in_google", "moved_by_buddy"
	for _, p := range []scheduleview.Projection{left, moved} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	movedID := scheduleview.ProjectedScheduleID(seedOkadaCalendar, left.EventID)
	if err := NewCalendarEventRecordRepository(testDB).Create(ctx, calendar.EventRecord{
		ScheduleID: movedID, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: moved.EventID, Version: 2,
	}); err != nil {
		t.Fatal(err)
	}
	leftID := scheduleview.DetachedScheduleID(seedOkadaCalendar, left.EventID)

	rows, err := r.ListByFacility(ctx, seedGoogleFacility, civil.Date{Year: 2099, Month: 1, Day: 1})
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]string{}
	for _, p := range rows {
		ids[p.EventID] = p.ScheduleID
	}
	if ids[left.EventID] != leftID || ids[moved.EventID] != movedID {
		t.Errorf("一覧での ID = %v, want 残った予定 %s、移した予定 %s", ids, leftID, movedID)
	}
	for id, want := range map[string]string{movedID: moved.EventID, leftID: left.EventID} {
		if got, err := r.GetBySchedule(ctx, seedGoogleFacility, id); err != nil || got.EventID != want || got.ScheduleID != id {
			t.Errorf("GetBySchedule(%s) = %+v, %v, want %s", id, got, err, want)
		}
	}
	if f, err := NewScheduleRepository(testDB).GetFacilityID(ctx, leftID); err != nil || f != seedGoogleFacility {
		t.Errorf("GetFacilityID(%s) = %s, %v", leftID, f, err)
	}
}

// TestCalendarProjectionRepositoryRecordVisit は、一覧と 1 件の読み出しが、記録の確定した版の訪問の情報を、利用者、主訪問者、同行者、
// サービスコードの名前と区分を付けて返し、保留の版の訪問の情報だけを持つ記録と、記録の無い行には訪問の情報を付けないことを確認する。
func TestCalendarProjectionRepositoryRecordVisit(t *testing.T) {
	ctx := txContext(t)
	const calID = "01M3TD000000000000000000CC"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com",
	}); err != nil {
		t.Fatal(err)
	}
	infos := NewVisitInfoRepository(testDB)
	const confirmedInfo, pendingInfo = "01M3TD000000000000000000V3", "01M3TD000000000000000000V4"
	for _, i := range []visit.Info{
		{ID: confirmedInfo, FacilityID: seedFacility, PatientID: seedPatient, AssignedStaffID: seedMori, CompanionID: ptr(seedAoki),
			ServiceCodeID: seedServiceCode, CategoryIDs: []string{seedEmergency, seedNight}},
		{ID: pendingInfo, FacilityID: seedFacility, PatientID: seedPatient, AssignedStaffID: seedMori, ServiceCodeID: seedServiceCode},
	} {
		if err := infos.Create(ctx, i); err != nil {
			t.Fatal(err)
		}
	}
	r := NewCalendarProjectionRepository(testDB)
	base := scheduleview.Projection{
		ExternalCalendarID: calID, FacilityID: seedFacility, StaffID: seedMori, Status: scheduleview.ProjectionConfirmed,
		Title: "【訪看I2】見本 一郎", ETag: `"1"`, Start: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:00:00+09:00")},
		End: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:30:00+09:00")}, LastEndDate: civilDate(2099, 11, 4),
	}
	confirmed, pending, google := base, base, base
	confirmed.EventID, pending.EventID, google.EventID = "confirmed", "pending", "google"
	for _, p := range []scheduleview.Projection{confirmed, pending, google} {
		if err := r.Put(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	records := NewCalendarEventRecordRepository(testDB)
	const confirmedID, pendingID = "01M3TD000000000000000000S8", "01M3TD000000000000000000S9"
	for _, rec := range []calendar.EventRecord{
		{ScheduleID: confirmedID, FacilityID: seedFacility, ExternalCalendarID: calID, ExternalEventID: confirmed.EventID, Version: 1, VisitInfoID: ptr(confirmedInfo)},
		{ScheduleID: pendingID, FacilityID: seedFacility, ExternalCalendarID: calID, ExternalEventID: pending.EventID,
			Pending: &calendar.PendingWrite{Version: 1, State: calendar.PendingUnknown, VisitInfoID: ptr(pendingInfo), Deadline: time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)}},
	} {
		if err := records.Create(ctx, rec); err != nil {
			t.Fatal(err)
		}
	}

	rows, err := r.ListByFacility(ctx, seedFacility, civil.Date{Year: 2099, Month: 1, Day: 1})
	if err != nil {
		t.Fatal(err)
	}
	visits := map[string]*visit.Detail{}
	for _, p := range rows {
		visits[p.EventID] = p.Visit
	}
	if len(visits) != 3 || visits[pending.EventID] != nil || visits[google.EventID] != nil {
		t.Errorf("保留の版だけの記録と記録の無い行の訪問の情報 = %+v, %+v, want nil（行 = %d 件）", visits[pending.EventID], visits[google.EventID], len(visits))
	}
	v := visits[confirmed.EventID]
	want := visit.Detail{
		ID: confirmedInfo, PatientID: seedPatient, PatientName: "見本 一郎", AssignedStaffID: seedMori, AssignedStaffName: "森 健太",
		CompanionID: ptr(seedAoki), CompanionName: ptr("青木 陽菜"), ServiceCodeID: seedServiceCode, ServiceCode: "訪看I2",
	}
	if v == nil || v.ID != want.ID || v.PatientID != want.PatientID || v.PatientName != want.PatientName || v.AssignedStaffID != want.AssignedStaffID ||
		v.AssignedStaffName != want.AssignedStaffName || v.CompanionID == nil || *v.CompanionID != seedAoki || v.CompanionName == nil ||
		*v.CompanionName != *want.CompanionName || v.ServiceCodeID != want.ServiceCodeID || v.ServiceCode != want.ServiceCode || len(v.Categories) != 2 {
		t.Fatalf("確定した版の訪問の情報 = %+v, want %+v と区分 2 つ", v, want)
	}
	got, err := r.GetBySchedule(ctx, seedFacility, confirmedID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Visit == nil || got.Visit.ID != confirmedInfo || got.Visit.CompanionName == nil || len(got.Visit.Categories) != 2 {
		t.Errorf("1 件の読み出しの訪問の情報 = %+v", got.Visit)
	}
	if got, err := r.GetBySchedule(ctx, seedFacility, pendingID); err != nil || got.Visit != nil {
		t.Errorf("保留の版だけの記録の 1 件の読み出し = %+v, %v, want 訪問の情報の無い行", got.Visit, err)
	}
}

// TestCalendarProjectionRepositoryExceptionVisit は、繰り返しの予定の例外の回の行が、回の記録が無いか確定した版を持たなければ
// 親の予定の記録の訪問の情報を返し、回の記録の確定した版があればその訪問の情報を返すことを確認する。
// 繰り返しの予定の記録の ID で、GetFacilityID が事業所を引けることも確認する。
func TestCalendarProjectionRepositoryExceptionVisit(t *testing.T) {
	ctx := txContext(t)
	const exCalID = "01M3TD000000000000000000CD"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: exCalID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com",
	}); err != nil {
		t.Fatal(err)
	}
	infos := NewVisitInfoRepository(testDB)
	const parentInfo, ownInfo, pendingInfo = "01M3TD000000000000000000V5", "01M3TD000000000000000000V6", "01M3TD000000000000000000V7"
	for _, id := range []string{parentInfo, ownInfo, pendingInfo} {
		if err := infos.Create(ctx, visit.Info{ID: id, FacilityID: seedFacility, PatientID: seedPatient, AssignedStaffID: seedMori, ServiceCodeID: seedServiceCode}); err != nil {
			t.Fatal(err)
		}
	}
	r := NewCalendarProjectionRepository(testDB)
	base := scheduleview.Projection{
		ExternalCalendarID: exCalID, FacilityID: seedFacility, StaffID: seedMori, Status: scheduleview.ProjectionConfirmed,
		Title: "【訪看I2】見本 一郎", ETag: `"1"`, Start: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:00:00+09:00")},
		End: scheduleview.ProjectionTime{At: timeAt(t, "2099-11-04T10:30:00+09:00")},
	}
	parent := base
	parent.EventID, parent.Recurrence = "series", []string{"RRULE:FREQ=WEEKLY"}
	rows := []scheduleview.Projection{parent}
	for _, id := range []string{"series_inherited", "series_own", "series_pending"} {
		ex := base
		ex.EventID, ex.RecurringEventID, ex.OriginalStart, ex.LastEndDate = id, parent.EventID, base.Start, civilDate(2099, 11, 4)
		rows = append(rows, ex)
	}
	for _, p := range rows {
		if err := r.Put(ctx, p); err != nil {
			t.Fatal(err)
		}
	}
	records := NewCalendarEventRecordRepository(testDB)
	const parentID, ownID, pendingID = "01M3TD000000000000000000SA", "01M3TD000000000000000000SB", "01M3TD000000000000000000SC"
	for _, rec := range []calendar.EventRecord{
		{ScheduleID: parentID, FacilityID: seedFacility, ExternalCalendarID: exCalID, ExternalEventID: "series", Version: 1, VisitInfoID: ptr(parentInfo)},
		{ScheduleID: ownID, FacilityID: seedFacility, ExternalCalendarID: exCalID, ExternalEventID: "series_own", Version: 1, VisitInfoID: ptr(ownInfo)},
		{ScheduleID: pendingID, FacilityID: seedFacility, ExternalCalendarID: exCalID, ExternalEventID: "series_pending",
			Pending: &calendar.PendingWrite{Version: 1, State: calendar.PendingUnknown, VisitInfoID: ptr(pendingInfo), Deadline: time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)}},
	} {
		if err := records.Create(ctx, rec); err != nil {
			t.Fatal(err)
		}
	}

	got, err := r.ListByFacility(ctx, seedFacility, civil.Date{Year: 2099, Month: 1, Day: 1})
	if err != nil {
		t.Fatal(err)
	}
	visits := map[string]string{}
	for _, p := range got {
		if p.Visit != nil {
			visits[p.EventID] = p.Visit.ID
		}
	}
	want := map[string]string{"series": parentInfo, "series_inherited": parentInfo, "series_own": ownInfo, "series_pending": parentInfo}
	for id, info := range want {
		if visits[id] != info {
			t.Errorf("行 %s の訪問の情報 = %q, want %q", id, visits[id], info)
		}
	}
	inheritedID := scheduleview.OccurrenceScheduleID(exCalID, "series", civil.Date{Year: 2099, Month: 11, Day: 4})
	inherited, err := r.GetBySchedule(ctx, seedFacility, inheritedID)
	if err != nil || inherited.EventID != "series_inherited" || inherited.ScheduleID != inheritedID || inherited.Visit == nil || inherited.Visit.ID != parentInfo {
		t.Errorf("記録の無い例外の回の 1 件 = %+v, %v", inherited.Visit, err)
	}
	own, err := r.GetBySchedule(ctx, seedFacility, ownID)
	if err != nil || own.Visit == nil || own.Visit.ID != ownInfo {
		t.Errorf("記録のある例外の回の 1 件 = %+v, %v", own.Visit, err)
	}
	if f, err := NewScheduleRepository(testDB).GetFacilityID(ctx, inheritedID); err != nil || f != seedFacility {
		t.Errorf("例外の回の一覧での ID の GetFacilityID = %s, %v, want %s", f, err, seedFacility)
	}
	if f, err := NewRecurringScheduleRepository(testDB).GetFacilityID(ctx, parentID); err != nil || f != seedFacility {
		t.Errorf("繰り返しの予定の記録の GetFacilityID = %s, %v, want %s", f, err, seedFacility)
	}
}
