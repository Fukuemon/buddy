package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// cutoverOps は、シードの google_primary の事業所で、DB と Google カレンダーのフェイクを使う切り替えの操作である。
type cutoverOps struct {
	start    calendarimport.StartCutover
	imp      calendarimport.Import
	complete calendarimport.CompleteCutover
	cancel   calendarimport.CancelCutover
	srv      *gcaltest.Server
}

func newCutoverOps(t *testing.T) cutoverOps {
	t.Helper()
	ev := func(id, summary, start, end string) *calendarv3.Event {
		return &calendarv3.Event{Id: id, Status: "confirmed", Summary: summary, Etag: `"` + id + `"`,
			Start: &calendarv3.EventDateTime{DateTime: start}, End: &calendarv3.EventDateTime{DateTime: end}}
	}
	weekly := ev("weekly", "定例", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00")
	weekly.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=MO"}
	moved := ev("weekly_1116", "定例", "2026-11-16T15:00:00+09:00", "2026-11-16T15:30:00+09:00")
	moved.RecurringEventId, moved.OriginalStartTime = "weekly", &calendarv3.EventDateTime{DateTime: "2026-11-16T09:00:00+09:00"}
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{"aoi.okada@example.com": {{
		ev("meeting", "会議", "2026-11-04T10:00:00+09:00", "2026-11-04T11:00:00+09:00"),
		ev("later", "研修の打ち合わせ", "2027-06-01T10:00:00+09:00", "2027-06-01T11:00:00+09:00"),
		weekly, moved,
	}}}}
	calendars := NewCalendarRepository(testDB)
	patients := NewPatientRepository(testDB)
	masters := NewServiceCodeRepository(testDB)
	staffRefs := NewStaffRefRepository(testDB)
	recurring := NewRecurringScheduleRepository(testDB)
	facilities := NewFacilityRepository(testDB)
	projections := NewCalendarProjectionRepository(testDB)
	cutovers := NewCalendarCutoverRepository(testDB)
	tx := NewTransactor(testDB)
	ids := ulid.Generator{}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff: staffRefs, Patients: patients, Infos: NewVisitInfoRepository(testDB), ServiceCodes: masters, Categories: NewVisitCategoryRepository(testDB),
	}, ids)
	accounts := sameAccount{gcal.NewReader(gcaltest.Start(t, srv))}
	now := func() time.Time { return time.Date(2026, 11, 5, 9, 0, 0, 0, calendar.Tokyo) }
	return cutoverOps{
		start: calendarimport.NewStartCutover(facilities, projections, cutovers, tx, ids, now, principal.RequireStaffManage),
		imp: calendarimport.NewImport(calendars, accounts, staffRefs, facilities, patients, recurring, masters, NewScheduleTypeRepository(testDB),
			recurring, NewScheduleRepository(testDB), visits, cutovers, tx, ids, principal.RequireStaffManage),
		complete: calendarimport.NewCompleteCutover(calendars, accounts, staffRefs, patients, recurring, masters, facilities, projections, cutovers,
			projections, tx, principal.RequireStaffManage),
		cancel: calendarimport.NewCancelCutover(facilities, cutovers, tx, principal.RequireStaffManage),
		srv:    srv,
	}
}

// cutoverContext は、シードの google_primary の事業所の岡田 葵を、職員の管理の権限で操作する ctx を返す。
// 岡田のカレンダーの最後の同期は、トランザクションの 1 時間前に成功したことにし、事業所の Projection に 1 行を置く。
func cutoverContext(t *testing.T) (context.Context, pgx.Tx) {
	t.Helper()
	ctx := txContext(t)
	ctx = principal.With(ctx, principal.Principal{Staff: principal.Staff{
		ID: seedOkada, FacilityID: seedGoogleFacility, Policies: []staff.PolicyGrant{{PolicyCode: organization.StaffManage}},
	}})
	tx := ctx.Value(txKey{}).(pgx.Tx)
	if _, err := tx.Exec(ctx, `
		INSERT INTO calendar_sync_states (external_calendar_id, facility_id, last_status, last_synced_at)
		VALUES ($1, $2, 'succeeded', now() - interval '1 hour')
		ON CONFLICT (external_calendar_id) DO UPDATE SET last_status = 'succeeded', last_error = NULL, last_synced_at = EXCLUDED.last_synced_at`,
		seedOkadaCalendar, seedGoogleFacility); err != nil {
		t.Fatal(err)
	}
	if err := NewCalendarProjectionRepository(testDB).Put(ctx, scheduleview.Projection{
		ExternalCalendarID: seedOkadaCalendar, EventID: "meeting", FacilityID: seedGoogleFacility, StaffID: seedOkada,
		Status: scheduleview.ProjectionConfirmed, Title: "会議", ETag: `"meeting"`,
		Start: scheduleview.ProjectionTime{At: timeAt(t, "2026-11-04T10:00:00+09:00")}, End: scheduleview.ProjectionTime{At: timeAt(t, "2026-11-04T11:00:00+09:00")},
	}); err != nil {
		t.Fatal(err)
	}
	return ctx, tx
}

func countRows(t *testing.T, ctx context.Context, tx pgx.Tx, query string, args ...any) int {
	t.Helper()
	var n int
	if err := tx.QueryRow(ctx, query, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// TestCalendarCutoverInDB は、切り替えを始め、終わりの無い期間で取り込み、Google で変わった予定を取り込み直し、
// 同期の後に完了する手順が、テーブルの制約に合う形で書けることを確認する。open の切り替えは、DB の一意の索引で 1 つまでである。
func TestCalendarCutoverInDB(t *testing.T) {
	ctx, tx := cutoverContext(t)
	ops := newCutoverOps(t)
	cut, err := ops.start.Do(ctx, seedGoogleFacility)
	if err != nil {
		t.Fatal(err)
	}
	if cut.RangeStart != (civil.Date{Year: 2026, Month: 11, Day: 1}) || cut.Status != calendarimport.CutoverOpen || cut.StartedBy != seedOkada {
		t.Fatalf("始めた切り替え = %+v", cut)
	}
	// 操作の確認を通らずに書いても、DB の一意の索引が 2 つ目の open を拒む
	err = NewCalendarCutoverRepository(testDB).Create(ctx, calendarimport.Cutover{
		ID: ulid.Generator{}.NewID(), FacilityID: seedGoogleFacility, RangeStart: cut.RangeStart, StartedBy: seedOkada,
	})
	if !errors.Is(err, apperr.ErrConflict) {
		t.Fatalf("2 つ目の open の切り替え: err = %v, want ErrConflict", err)
	}

	rng := cut.Range()
	res, err := ops.imp.Do(ctx, seedOkadaCalendar, rng, nil)
	if err != nil {
		t.Fatal(err)
	}
	// 会議、先の研修の打ち合わせ、繰り返し、11-16 の置き換え
	if res.Run.ImportedCount != 4 || res.Run.CutoverID == nil || *res.Run.CutoverID != cut.ID || !res.Run.RangeEnd.IsZero() {
		t.Fatalf("取り込みの記録 = %+v", res.Run)
	}
	if n := countRows(t, ctx, tx, `SELECT count(*) FROM external_event_links WHERE cutover_id = $1`, cut.ID); n != 4 {
		t.Errorf("切り替えの予定の対応 = %d, want 4", n)
	}
	if n := countRows(t, ctx, tx, `SELECT count(*) FROM import_runs WHERE cutover_id = $1 AND range_end IS NULL`, cut.ID); n != 1 {
		t.Errorf("終わりの無い取り込みの記録 = %d, want 1", n)
	}

	// Google で繰り返しの親を変えると、親と回を消して取り込み直す
	ops.srv.Edit("aoi.okada@example.com", "weekly", func(ev *calendarv3.Event) { ev.Summary = "定例会" })
	again, err := ops.imp.Do(ctx, seedOkadaCalendar, rng, nil)
	if err != nil {
		t.Fatal(err)
	}
	if again.Run.ImportedCount != 2 || again.AlreadyImported != 2 {
		t.Errorf("取り込み直し = %+v、AlreadyImported %d, want 繰り返しと置き換えの 2 件", again.Run, again.AlreadyImported)
	}
	if n := countRows(t, ctx, tx, `SELECT count(*) FROM recurring_schedules WHERE facility_id = $1 AND title = '定例会'`, seedGoogleFacility); n != 1 {
		t.Errorf("取り込み直した繰り返し = %d, want 1", n)
	}
	if n := countRows(t, ctx, tx, `SELECT count(*) FROM recurring_schedules WHERE facility_id = $1`, seedGoogleFacility); n != 1 {
		t.Errorf("事業所の繰り返し = %d, want 前の写しを消して 1", n)
	}

	var ie *calendarimport.IncompleteError
	if _, err := ops.complete.Do(ctx, cut.ID); !errors.As(err, &ie) || len(ie.Items) != 1 || ie.Items[0].Reason != calendarimport.UnmetSyncStale {
		t.Fatalf("同期の前の完了: err = %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE calendar_sync_states SET last_synced_at = now() + interval '1 minute' WHERE external_calendar_id = $1`, seedOkadaCalendar); err != nil {
		t.Fatal(err)
	}
	done, err := ops.complete.Do(ctx, cut.ID)
	if err != nil {
		t.Fatal(err)
	}
	if done.Status != calendarimport.CutoverCompleted || done.FinishedAt == nil {
		t.Errorf("完了した切り替え = %+v", done)
	}
	f, err := NewFacilityRepository(testDB).Get(ctx, seedGoogleFacility)
	if err != nil || f.SourceMode != organization.SourceBuddyPrimary {
		t.Errorf("事業所 = %+v, %v, want buddy_primary", f, err)
	}
	if n := countRows(t, ctx, tx, `SELECT count(*) FROM calendar_event_projections WHERE facility_id = $1`, seedGoogleFacility); n != 0 {
		t.Errorf("Projection の行 = %d, want 0", n)
	}
}

// TestCalendarCutoverCancelInDB は、切り替えをやめると、切り替えの取り込みで作った予定、繰り返しの予定、除外の日、予定の対応を消し、
// 事業所を google_primary のままにすることを確認する。
func TestCalendarCutoverCancelInDB(t *testing.T) {
	ctx, tx := cutoverContext(t)
	ops := newCutoverOps(t)
	cut, err := ops.start.Do(ctx, seedGoogleFacility)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ops.imp.Do(ctx, seedOkadaCalendar, cut.Range(), nil); err != nil {
		t.Fatal(err)
	}
	done, err := ops.cancel.Do(ctx, cut.ID)
	if err != nil {
		t.Fatal(err)
	}
	if done.Status != calendarimport.CutoverCanceled {
		t.Errorf("やめた切り替え = %+v", done)
	}
	for table, n := range map[string]int{
		"schedules":            countRows(t, ctx, tx, `SELECT count(*) FROM schedules WHERE facility_id = $1`, seedGoogleFacility),
		"recurring_schedules":  countRows(t, ctx, tx, `SELECT count(*) FROM recurring_schedules WHERE facility_id = $1`, seedGoogleFacility),
		"external_event_links": countRows(t, ctx, tx, `SELECT count(*) FROM external_event_links WHERE facility_id = $1`, seedGoogleFacility),
	} {
		if n != 0 {
			t.Errorf("%s = %d, want 0", table, n)
		}
	}
	f, err := NewFacilityRepository(testDB).Get(ctx, seedGoogleFacility)
	if err != nil || f.SourceMode != organization.SourceGooglePrimary {
		t.Errorf("事業所 = %+v, %v, want google_primary のまま", f, err)
	}
	// やめた後に、もう一度始められる
	if _, err := ops.start.Do(ctx, seedGoogleFacility); err != nil {
		t.Errorf("やめた後に始める: err = %v", err)
	}
}
