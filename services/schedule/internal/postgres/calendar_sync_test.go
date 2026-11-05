package postgres

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// 同期の状態のリポジトリが取る、事業所の正本のモード。
var (
	buddyPrimary  = []organization.SourceMode{organization.SourceBuddyPrimary}
	googlePrimary = []organization.SourceMode{organization.SourceGooglePrimary}
)

// reconcileSyncer は、buddy_primary の事業所の外部の変更を ReconcileApplier で buddy の予定に当てる同期の処理を作る。
// 組み立て（assemble）は buddy_primary の Applier を渡さず、buddy_primary の事業所のカレンダーを読まない（ADR-0009）。
// ReconcileApplier は、使わなくなった後も規則を残すので、表の制約に合う形で当てられるかを確認し続ける。
func reconcileSyncer(deps calendarsync.SyncerDeps, rd calendarsync.ReconcileDeps, tx *Transactor, ids ulid.Generator) *calendarsync.Syncer {
	return calendarsync.NewSyncer(deps, calendarsync.Appliers{organization.SourceBuddyPrimary: calendarsync.NewReconcileApplier(rd, ids)},
		tx, 0, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

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

func TestCalendarExportHoldAndResolve(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarExportRepository(testDB)
	const (
		exportID = "01M3TD000000000000000000X5"
		holdID   = "01M3TD000000000000000000X6"
		newID    = "01M3TD000000000000000000X7"
	)
	single := calendar.Target{FacilityID: seedFacility, ScheduleID: seedConference}
	if _, err := r.Open(ctx, single); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("待ちが無いときの Open = %v", err)
	}
	if err := r.Enqueue(ctx, exportID, single); err != nil {
		t.Fatal(err)
	}
	claimed, err := r.Claim(ctx, 10, time.Minute)
	if err != nil || len(claimed) != 1 {
		t.Fatalf("Claim = %+v, %v", claimed, err)
	}
	if e, err := r.Open(ctx, single); err != nil || e.ID != exportID || e.LockedUntil == nil {
		t.Fatalf("取った待ちの Open = %+v, %v", e, err)
	}

	// 終わっていない待ちを確認が必要な待ちにすると、書いていた処理の結果は捨てる
	if err := r.Hold(ctx, holdID, single, calendar.ErrorPreconditionFailed); err != nil {
		t.Fatal(err)
	}
	if err := r.Finish(ctx, claimed[0], calendar.ExportResult{Status: calendar.ExportSucceeded}); err != nil {
		t.Fatal(err)
	}
	e, err := r.Get(ctx, exportID)
	if err != nil || e.Status != calendar.ExportConflict || *e.ErrorCode != calendar.ErrorPreconditionFailed || e.LockedUntil != nil || !e.IsAcceptable() {
		t.Fatalf("確認が必要な待ち = %+v, %v", e, err)
	}
	if _, err := r.Get(ctx, holdID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("終わっていない待ちがあるのに足した: %v", err)
	}

	// 読んだ後に保留し直された待ちは終えない
	if err := r.Resolve(ctx, exportID, 1); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("古い revision で解く: err = %v", err)
	}
	if err := r.Resolve(ctx, exportID, 2); err != nil {
		t.Fatal(err)
	}
	if e, _ := r.Get(ctx, exportID); e.Status != calendar.ExportSucceeded {
		t.Errorf("解いた待ち = %+v", e)
	}
	if err := r.Resolve(ctx, exportID, 2); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("解いた待ちをもう一度解く: err = %v", err)
	}

	// 待ちが無ければ、確認が必要な待ちを足す。繰り返しの予定の待ちは、Google の内容で解けない
	recurring := calendar.Target{FacilityID: seedFacility, RecurringScheduleID: seedRecurring}
	if err := r.Hold(ctx, newID, recurring, calendar.ErrorUnappliable); err != nil {
		t.Fatal(err)
	}
	e, err = r.Open(ctx, recurring)
	if err != nil || e.ID != newID || e.Status != calendar.ExportConflict || *e.ErrorCode != calendar.ErrorUnappliable || e.IsAcceptable() {
		t.Errorf("足した確認が必要な待ち = %+v, %v", e, err)
	}
}

// TestCalendarSyncAppliesVisitChanges は、取り込んだ訪問の予定の、Google での利用者の変更と回の取り消しを、
// 同期の処理が表の制約に合う形で当てられることを確認する。
func TestCalendarSyncAppliesVisitChanges(t *testing.T) {
	ctx := txContext(t)
	ctx = principal.With(ctx, principal.Principal{Staff: principal.Staff{
		ID: seedAoki, FacilityID: seedFacility,
		Policies: []staff.PolicyGrant{{PolicyCode: organization.StaffManage}},
	}})
	ev := func(id, summary, start, end string) *calendarv3.Event {
		return &calendarv3.Event{Id: id, Status: "confirmed", Summary: summary, Etag: `"` + id + `"`,
			Start: &calendarv3.EventDateTime{DateTime: start}, End: &calendarv3.EventDateTime{DateTime: end}}
	}
	weekly := ev("weekly", "【訪看I2】見本 一郎", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00")
	weekly.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=MO"}
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{"mori@example.com": {{
		ev("single", "【訪看I2】見本 一郎", "2026-11-04T10:00:00+09:00", "2026-11-04T10:30:00+09:00"),
		weekly,
	}}}}
	calendars := NewCalendarRepository(testDB)
	const calID = "01M3TD000000000000000000C5"
	if err := calendars.Create(ctx, calendar.ExternalCalendar{ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com"}); err != nil {
		t.Fatal(err)
	}
	patients := NewPatientRepository(testDB)
	masters := NewServiceCodeRepository(testDB)
	staffRefs := NewStaffRefRepository(testDB)
	schedules := NewScheduleRepository(testDB)
	recurring := NewRecurringScheduleRepository(testDB)
	types := NewScheduleTypeRepository(testDB)
	ids := ulid.Generator{}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff:    staffRefs,
		Patients: patients,
		Infos:    NewVisitInfoRepository(testDB), ServiceCodes: masters, Categories: NewVisitCategoryRepository(testDB),
	}, ids)
	source := gcal.NewReader(gcaltest.Start(t, srv))
	tx := NewTransactor(testDB)
	importCalendar := calendarimport.NewImport(calendars, sameAccount{source}, staffRefs, NewFacilityRepository(testDB), patients, recurring, masters,
		types, recurring, schedules, visits, NewCalendarCutoverRepository(testDB), tx, ids, principal.RequireStaffManage)
	rng, err := calendarimport.NewRange(civil.Date{Year: 2026, Month: 11, Day: 1}, civil.Date{Year: 2026, Month: 11, Day: 30})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := importCalendar.Do(ctx, calID, rng, nil); err != nil {
		t.Fatal(err)
	}
	syncer := reconcileSyncer(calendarsync.SyncerDeps{
		Syncs: NewCalendarSyncRepository(testDB), Calendars: calendars, Staff: NewStaffRefRepository(testDB), Locks: NewFacilityRepository(testDB),
		Sources: func(context.Context, string) (calendar.EventSource, error) { return source, nil },
	}, calendarsync.ReconcileDeps{
		Calendars: calendars, Exports: NewCalendarExportRepository(testDB),
		Schedules: schedules, Recurring: recurring, Types: types, Patients: patients, ServiceCodes: masters, Visits: visits,
	}, tx, ids)
	sync := func() {
		t.Helper()
		if _, err := syncer.SyncDue(ctx); err != nil {
			t.Fatal(err)
		}
	}
	sync()

	// 職員が Google カレンダーで、予定の利用者と時刻を変え、繰り返しの 11-09 の回を取り消した
	srv.Edit("mori@example.com", "single", func(e *calendarv3.Event) {
		e.Summary = "【訪看I2】見本 二葉"
		e.Start.DateTime, e.End.DateTime = "2026-11-04T11:00:00+09:00", "2026-11-04T11:30:00+09:00"
	})
	srv.Put("mori@example.com", &calendarv3.Event{
		Id: "weekly_1109", Status: "cancelled", RecurringEventId: "weekly",
		OriginalStartTime: &calendarv3.EventDateTime{DateTime: "2026-11-09T09:00:00+09:00"},
	})
	sync()

	single, err := calendars.LinkByEvent(ctx, calID, "single")
	if err != nil {
		t.Fatal(err)
	}
	d, err := schedules.Get(ctx, *single.ScheduleID)
	if err != nil {
		t.Fatal(err)
	}
	if d.Visit == nil || d.Visit.PatientName != "見本 二葉" || d.Visit.AssignedStaffID != seedMori || d.StartTime != (civil.Time{Hour: 11}) {
		t.Errorf("Google の変更を当てた訪問の予定 = %+v, 訪問 %+v", d.Slot, d.Visit)
	}
	if *single.SyncedVersion != d.Version || single.ETag == `"single"` {
		t.Errorf("予定の対応 = %+v, 予定の更新の番号 %d", single, d.Version)
	}
	parent, err := calendars.LinkByEvent(ctx, calID, "weekly")
	if err != nil {
		t.Fatal(err)
	}
	rs, err := recurring.Get(ctx, *parent.RecurringScheduleID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rs.ExclusionDates) != 1 || rs.ExclusionDates[0] != (civil.Date{Year: 2026, Month: 11, Day: 9}) || *parent.SyncedVersion != rs.Version {
		t.Errorf("取り消した回を除外した繰り返しの予定 = %v, 版 %d, 対応 %+v", rs.ExclusionDates, rs.Version, parent)
	}

	// 職員が Google カレンダーで、予定のサービス内容を別のサービスコードに変えた
	srv.Edit("mori@example.com", "single", func(e *calendarv3.Event) { e.Summary = "【訪看I3】見本 二葉" })
	sync()
	if d, err = schedules.Get(ctx, *single.ScheduleID); err != nil {
		t.Fatal(err)
	}
	if d.Visit == nil || d.Visit.ServiceCode != "訪看I3" || d.Visit.PatientName != "見本 二葉" {
		t.Errorf("サービス内容を変えた訪問の予定 = %+v", d.Visit)
	}

	// どのサービスコードにも当たらないサービス内容は当てず、確認が必要な待ちにする
	srv.Edit("mori@example.com", "single", func(e *calendarv3.Event) { e.Summary = "【訪看Z9】見本 二葉" })
	sync()
	kept, err := schedules.Get(ctx, *single.ScheduleID)
	if err != nil {
		t.Fatal(err)
	}
	if kept.Visit == nil || kept.Visit.ServiceCode != "訪看I3" || kept.Version != d.Version {
		t.Errorf("当たらないサービス内容を当てた: 訪問 %+v, 更新の番号 %d → %d", kept.Visit, d.Version, kept.Version)
	}
	issues, err := NewCalendarExportRepository(testDB).ListIssues(ctx, seedFacility)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(issues, func(i calendar.ExportIssue) bool {
		return i.ScheduleID == d.ID && i.ErrorCode != nil && *i.ErrorCode == calendar.ErrorUnappliable
	}) {
		t.Errorf("確認が必要な待ち = %+v, want 予定 %s の unappliable", issues, d.ID)
	}
}

// TestCalendarSyncKeepsEndedPatientOnlyInPast は、利用の終了の利用者の取り込んだ予定に、Google での今日より前の変更は当て、
// 利用者を変えずに今日以降へ動かす変更は当てないことを確認する（ADR-0001）。
func TestCalendarSyncKeepsEndedPatientOnlyInPast(t *testing.T) {
	ctx := txContext(t)
	ctx = principal.With(ctx, principal.Principal{Staff: principal.Staff{
		ID: seedAoki, FacilityID: seedFacility,
		Policies: []staff.PolicyGrant{{PolicyCode: organization.StaffManage}},
	}})
	const futaba = "01M3TC67EREWP3ED55WDTKD23Z"
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{"mori@example.com": {{
		{Id: "past", Status: "confirmed", Summary: "【訪看I2】見本 二葉", Etag: `"past"`,
			Start: &calendarv3.EventDateTime{DateTime: "2026-10-05T10:00:00+09:00"}, End: &calendarv3.EventDateTime{DateTime: "2026-10-05T10:30:00+09:00"}},
	}}}}
	calendars := NewCalendarRepository(testDB)
	const calID = "01M3TD000000000000000000C6"
	if err := calendars.Create(ctx, calendar.ExternalCalendar{ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com"}); err != nil {
		t.Fatal(err)
	}
	patients := NewPatientRepository(testDB)
	masters := NewServiceCodeRepository(testDB)
	staffRefs := NewStaffRefRepository(testDB)
	schedules := NewScheduleRepository(testDB)
	recurring := NewRecurringScheduleRepository(testDB)
	types := NewScheduleTypeRepository(testDB)
	ids := ulid.Generator{}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff: staffRefs, Patients: patients, Infos: NewVisitInfoRepository(testDB), ServiceCodes: masters, Categories: NewVisitCategoryRepository(testDB),
	}, ids)
	source := gcal.NewReader(gcaltest.Start(t, srv))
	tx := NewTransactor(testDB)
	importCalendar := calendarimport.NewImport(calendars, sameAccount{source}, staffRefs, NewFacilityRepository(testDB), patients, recurring, masters,
		types, recurring, schedules, visits, NewCalendarCutoverRepository(testDB), tx, ids, principal.RequireStaffManage)
	rng, err := calendarimport.NewRange(civil.Date{Year: 2026, Month: 10, Day: 1}, civil.Date{Year: 2026, Month: 10, Day: 31})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := importCalendar.Do(ctx, calID, rng, nil); err != nil {
		t.Fatal(err)
	}
	syncer := reconcileSyncer(calendarsync.SyncerDeps{
		Syncs: NewCalendarSyncRepository(testDB), Calendars: calendars, Staff: staffRefs, Locks: NewFacilityRepository(testDB),
		Sources: func(context.Context, string) (calendar.EventSource, error) { return source, nil },
	}, calendarsync.ReconcileDeps{
		Calendars: calendars, Exports: NewCalendarExportRepository(testDB),
		Schedules: schedules, Recurring: recurring, Types: types, Patients: patients, ServiceCodes: masters, Visits: visits,
	}, tx, ids)
	sync := func() {
		t.Helper()
		if _, err := syncer.SyncDue(ctx); err != nil {
			t.Fatal(err)
		}
	}
	sync()
	if err := patients.End(ctx, futaba); err != nil {
		t.Fatal(err)
	}
	link, err := calendars.LinkByEvent(ctx, calID, "past")
	if err != nil {
		t.Fatal(err)
	}
	get := func() scheduleview.Detail {
		t.Helper()
		d, err := schedules.Get(ctx, *link.ScheduleID)
		if err != nil {
			t.Fatal(err)
		}
		return d
	}

	// 今日より前のまま時刻だけを変えた変更は当てる
	srv.Edit("mori@example.com", "past", func(e *calendarv3.Event) {
		e.Start.DateTime, e.End.DateTime = "2026-10-05T11:00:00+09:00", "2026-10-05T11:30:00+09:00"
	})
	sync()
	if d := get(); d.StartTime != (civil.Time{Hour: 11}) || d.Visit == nil || d.Visit.PatientID != futaba {
		t.Fatalf("今日より前の変更を当てた予定 = %+v, 訪問 %+v", d.Slot, d.Visit)
	}

	// 利用者を変えずに今日以降へ動かした変更は当てない
	srv.Edit("mori@example.com", "past", func(e *calendarv3.Event) {
		e.Start.DateTime, e.End.DateTime = "2099-01-05T11:00:00+09:00", "2099-01-05T11:30:00+09:00"
	})
	sync()
	if d := get(); d.Date != (civil.Date{Year: 2026, Month: 10, Day: 5}) {
		t.Errorf("利用の終了の利用者の予定を今日以降へ動かした: %+v", d.Slot)
	}
}

// TestCalendarSyncForgetsTokenToReadAll は、空のトークンで同期の結果を書くと、トークンを消し、次の Claim がトークンを空で返す
// （全ての予定を読み直す）ことと、失敗の結果が最後の成功の時刻を進めないことを確認する。
// トークンが切れた（410）後の全件の読み直しが失敗したときに当たる。
func TestCalendarSyncForgetsTokenToReadAll(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(pgx.Tx)
	// 同期は、Google カレンダーを正本にする事業所のカレンダーを読む（ADR-0009）
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
