package postgres

import (
	"context"
	"io"
	"log/slog"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
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
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(NewCalendarProjectionRepository(testDB), log),
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
