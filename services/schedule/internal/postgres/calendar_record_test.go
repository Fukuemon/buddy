package postgres

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// TestCalendarEventRecordRepository は、Google カレンダーに書いた予定の記録を書き、保留の版を確定して消せることと、
// 記録が指す訪問の情報を、予定が指していなくても DeleteIfUnused が消さないことを確認する。
func TestCalendarEventRecordRepository(t *testing.T) {
	ctx := txContext(t)
	const calID, scheduleID = "01M3TD000000000000000000CB", "01M3TD000000000000000000S1"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com",
	}); err != nil {
		t.Fatal(err)
	}
	infos := NewVisitInfoRepository(testDB)
	const infoID = "01M3TD000000000000000000V1"
	if err := infos.Create(ctx, visit.Info{
		ID: infoID, FacilityID: seedFacility, PatientID: seedPatient, AssignedStaffID: seedMori, ServiceCodeID: seedServiceCode,
		CategoryIDs: []string{seedEmergency},
	}); err != nil {
		t.Fatal(err)
	}
	r := NewCalendarEventRecordRepository(testDB)
	deadline := time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC)
	rec := calendar.EventRecord{
		ScheduleID: scheduleID, FacilityID: seedFacility, ExternalCalendarID: calID, ExternalEventID: "ev1",
		Pending: &calendar.PendingWrite{Version: 1, State: calendar.PendingWriting, VisitInfoID: ptr(infoID), Deadline: deadline},
	}
	if err := r.Create(ctx, rec); err != nil {
		t.Fatal(err)
	}
	got, err := r.GetForUpdate(ctx, scheduleID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != 0 || got.VisitInfoID != nil || got.Pending == nil || got.Pending.Version != 1 || got.Pending.State != calendar.PendingWriting ||
		got.Pending.VisitInfoID == nil || *got.Pending.VisitInfoID != infoID || !got.Pending.Deadline.Equal(deadline) {
		t.Fatalf("記録 = %+v, 保留の版 = %+v", got, got.Pending)
	}
	if err := r.Create(ctx, rec); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("同じ予定の記録: err = %v, want ErrConflict", err)
	}
	unconfirmed := rec
	unconfirmed.ScheduleID, unconfirmed.ExternalEventID, unconfirmed.Pending = "01M3TD000000000000000000S2", "ev2", nil
	if err := r.Create(ctx, unconfirmed); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("確定した版も保留の版も無い記録: err = %v, want ErrInvalidInput", err)
	}

	if err := infos.DeleteIfUnused(ctx, infoID); err != nil {
		t.Fatal(err)
	}
	d, err := infos.GetDetail(ctx, infoID)
	if err != nil {
		t.Fatalf("保留の版の訪問の情報が消えた: %v", err)
	}
	if d.PatientName == "" || d.AssignedStaffName == "" || d.ServiceCode == "" || len(d.Categories) != 1 {
		t.Errorf("訪問の情報 = %+v", d)
	}

	got.Version, got.VisitInfoID, got.Pending = 1, got.Pending.VisitInfoID, nil
	if err := r.Update(ctx, got); err != nil {
		t.Fatal(err)
	}
	if got, err = r.GetForUpdate(ctx, scheduleID); err != nil || got.Version != 1 || got.Pending != nil || got.VisitInfoID == nil {
		t.Fatalf("確定した記録 = %+v, err = %v", got, err)
	}
	if err := infos.DeleteIfUnused(ctx, infoID); err != nil {
		t.Fatal(err)
	}
	if _, err := infos.GetDetail(ctx, infoID); err != nil {
		t.Fatalf("確定した訪問の情報が消えた: %v", err)
	}

	if err := r.Delete(ctx, scheduleID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.GetForUpdate(ctx, scheduleID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("消した記録: err = %v, want ErrNotFound", err)
	}
	if err := infos.DeleteIfUnused(ctx, infoID); err != nil {
		t.Fatal(err)
	}
	if _, err := infos.GetDetail(ctx, infoID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("どれも指さない訪問の情報: err = %v, want ErrNotFound", err)
	}
}

// TestCalendarEventRecordClaimExpired は、ClaimExpired が、書く期限を過ぎた保留の版を持つ記録を、状態によらず書く期限の古い順に取り、
// 期限の前の保留の版、保留の版の無い記録、モードが違う事業所の記録、外したカレンダーの記録を取らないことと、取った記録を lease の間は
// 取り直さず、Release か lease の後に取り直せることを確認する。
func TestCalendarEventRecordClaimExpired(t *testing.T) {
	ctx := txContext(t)
	const moriCal, disabledCal = "01M3TD000000000000000000CB", "01M3TD000000000000000000CD"
	if err := NewCalendarRepository(testDB).Create(ctx, calendar.ExternalCalendar{
		ID: moriCal, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := ctx.Value(txKey{}).(pgx.Tx).Exec(ctx, `INSERT INTO external_calendars (id, facility_id, staff_id, provider, external_calendar_id, disabled_at)
		VALUES ($1, $2, $3, 'google', 'okada-old@example.com', now())`, disabledCal, seedGoogleFacility, seedOkada); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2099, 1, 1, 9, 0, 0, 0, time.UTC)
	r := NewCalendarEventRecordRepository(testDB)
	pending := func(state calendar.PendingState, deadline time.Time) *calendar.PendingWrite {
		return &calendar.PendingWrite{Version: 1, State: state, Deadline: deadline}
	}
	const unknown, writing = "01M3TD000000000000000000R1", "01M3TD000000000000000000R2"
	for _, rec := range []calendar.EventRecord{
		{ScheduleID: writing, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: "ev2",
			Pending: pending(calendar.PendingWriting, now.Add(-time.Minute))},
		{ScheduleID: unknown, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: "ev1",
			Pending: pending(calendar.PendingUnknown, now.Add(-time.Hour))},
		{ScheduleID: "01M3TD000000000000000000R3", FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: "ev3",
			Pending: pending(calendar.PendingUnknown, now.Add(time.Hour))},
		{ScheduleID: "01M3TD000000000000000000R4", FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: "ev4", Version: 1},
		{ScheduleID: "01M3TD000000000000000000R5", FacilityID: seedFacility, ExternalCalendarID: moriCal, ExternalEventID: "ev5",
			Pending: pending(calendar.PendingUnknown, now.Add(-time.Hour))},
		{ScheduleID: "01M3TD000000000000000000R6", FacilityID: seedGoogleFacility, ExternalCalendarID: disabledCal, ExternalEventID: "ev6",
			Pending: pending(calendar.PendingUnknown, now.Add(-time.Hour))},
	} {
		if err := r.Create(ctx, rec); err != nil {
			t.Fatal(err)
		}
	}
	googlePrimary := []organization.SourceMode{organization.SourceGooglePrimary}
	claim := func(at time.Time, max int) []string {
		t.Helper()
		got, err := r.ClaimExpired(ctx, at, max, time.Minute, googlePrimary)
		if err != nil {
			t.Fatal(err)
		}
		ids := make([]string, len(got))
		for i, p := range got {
			ids[i] = p.Record.ScheduleID
			if p.Calendar.ID != seedOkadaCalendar || p.Calendar.FacilityID != seedGoogleFacility || p.Calendar.StaffID != seedOkada ||
				p.Calendar.CalendarID == "" || p.Record.Pending == nil || !p.LockedUntil.Equal(at.Add(time.Minute)) {
				t.Errorf("取った記録 = %+v", p)
			}
		}
		slices.Sort(ids)
		return ids
	}

	if got := claim(now, 1); !slices.Equal(got, []string{unknown}) {
		t.Fatalf("1 件の Claim = %v, want 書く期限の古い %s", got, unknown)
	}
	all, err := r.ClaimExpired(ctx, now, 10, time.Minute, googlePrimary)
	if err != nil || len(all) != 1 || all[0].Record.ScheduleID != writing || all[0].Record.Pending.State != calendar.PendingWriting {
		t.Fatalf("次の Claim = %+v, %v, want lease の間の %s を除いた %s", all, err, unknown, writing)
	}
	if got := claim(now, 10); len(got) != 0 {
		t.Errorf("lease の間の Claim = %v, want 無し", got)
	}
	if err := r.Release(ctx, all[0]); err != nil {
		t.Fatal(err)
	}
	if got := claim(now, 10); !slices.Equal(got, []string{writing}) {
		t.Errorf("戻した後の Claim = %v, want %s", got, writing)
	}
	if got := claim(now.Add(2*time.Minute), 10); !slices.Equal(got, []string{unknown, writing}) {
		t.Errorf("lease の後の Claim = %v, want %s と %s", got, unknown, writing)
	}
}

// TestCalendarReadBackDue は、PostgreSQL の上で、同期の読み戻しが、書く期限を過ぎた保留の版を、Google に予定が無ければ記録ごと消し、
// 版が同じ予定があれば確定して Projection に写すことを確認する。
func TestCalendarReadBackDue(t *testing.T) {
	ctx := txContext(t)
	const missing, accepted = "01M3TD000000000000000000R1", "01M3TD000000000000000000R2"
	missingEvent, err := calendar.EventIDOf(missing)
	if err != nil {
		t.Fatal(err)
	}
	acceptedEvent, err := calendar.EventIDOf(accepted)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	records := NewCalendarEventRecordRepository(testDB)
	for id, eventID := range map[string]string{missing: missingEvent, accepted: acceptedEvent} {
		if err := records.Create(ctx, calendar.EventRecord{
			ScheduleID: id, FacilityID: seedGoogleFacility, ExternalCalendarID: seedOkadaCalendar, ExternalEventID: eventID,
			Pending: &calendar.PendingWrite{Version: 1, State: calendar.PendingUnknown, Deadline: now.Add(-time.Minute)},
		}); err != nil {
			t.Fatal(err)
		}
	}
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{"aoi.okada@example.com": {{{
		Id: acceptedEvent, Status: "confirmed", Summary: "担当者会議", Updated: "2099-10-30T08:00:00Z",
		Start:              &calendarv3.EventDateTime{DateTime: "2099-11-04T13:00:00+09:00"},
		End:                &calendarv3.EventDateTime{DateTime: "2099-11-04T14:00:00+09:00"},
		ExtendedProperties: &calendarv3.EventExtendedProperties{Private: map[string]string{calendar.PropScheduleID: accepted, calendar.PropVersion: "1"}},
	}}}}}
	source := gcal.NewReader(gcaltest.Start(t, srv))
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	visits := NewVisitInfoRepository(testDB)
	syncer := calendarsync.NewSyncer(calendarsync.SyncerDeps{
		Syncs: NewCalendarSyncRepository(testDB), Calendars: NewCalendarRepository(testDB), Staff: NewStaffRefRepository(testDB),
		Locks: NewFacilityRepository(testDB), Records: records, Visits: visits,
		Sources: func(context.Context, string) (calendar.EventSource, error) { return source, nil },
	}, calendarsync.Appliers{
		organization.SourceGooglePrimary: calendarsync.NewProjectionApplier(NewCalendarProjectionRepository(testDB), records, visits, log),
	}, NewTransactor(testDB), 0, log)
	if n, err := syncer.ReadBackDue(ctx); err != nil || n != 2 {
		t.Fatalf("ReadBackDue = %d, %v, want 2", n, err)
	}

	if _, err := records.GetForUpdate(ctx, missing); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("予定が無い記録: err = %v, want ErrNotFound", err)
	}
	if got, err := records.GetForUpdate(ctx, accepted); err != nil || got.Version != 1 || got.Pending != nil {
		t.Errorf("版が同じ記録 = %+v, %v, want 版 1 で確定", got, err)
	}
	if rows := projectionRows(t, ctx, seedOkadaCalendar); rows[acceptedEvent].Title != "担当者会議" {
		t.Errorf("Projection の行 = %+v", rows)
	}
}

// writerAccount は、全ての事業所で同じ Google カレンダーのフェイクに読み書きする calendar.Accounts である。
type writerAccount struct{ svc *calendarv3.Service }

func (writerAccount) ServiceAccount(context.Context, string) (string, error) {
	return "buddy@example.iam.gserviceaccount.com", nil
}

func (a writerAccount) Source(context.Context, string) (calendar.EventSource, error) {
	return gcal.NewReader(a.svc), nil
}

func (a writerAccount) Writer(context.Context, string) (calendar.EventWriter, error) {
	return gcal.NewWriter(a.svc), nil
}

// TestCalendarWriteCreate は、google_primary の事業所で calendarwrite.Create が、PostgreSQL の上で Google カレンダーに予定を作り、
// Projection の行と確定した記録を書くことと、Google が結果の分からないエラーを返すと保留の版を残すことを確認する。
func TestCalendarWriteCreate(t *testing.T) {
	ctx := principal.With(txContext(t), principal.Principal{Staff: principal.Staff{
		ID: seedOkada, FacilityID: seedGoogleFacility, Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleSelfEdit}},
	}})
	const okadaCal = "aoi.okada@example.com"
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{okadaCal: {nil}}}
	ids := ulid.Generator{}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff: NewStaffRefRepository(testDB), Patients: NewPatientRepository(testDB), Infos: NewVisitInfoRepository(testDB),
		ServiceCodes: NewServiceCodeRepository(testDB), Categories: NewVisitCategoryRepository(testDB),
	}, ids)
	projections := NewCalendarProjectionRepository(testDB)
	create := calendarwrite.NewCreate(NewFacilityRepository(testDB), projections, NewScheduleTypeRepository(testDB), NewStaffRefRepository(testDB),
		NewStaffRepository(testDB), visits, NewVisitInfoRepository(testDB), NewCalendarRepository(testDB), NewCalendarEventRecordRepository(testDB),
		projections, writerAccount{gcaltest.Start(t, srv)}, nil, NewTransactor(testDB))
	title := "担当者会議"
	in := schedule.SlotInput{
		TypeID: seedNormalType, Date: civil.Date{Year: 2099, Month: 11, Day: 4}, StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14},
		StaffID: seedOkada, Title: &title,
	}

	const created = "01M3TD000000000000000000S3"
	got, err := create.Do(ctx, seedGoogleFacility, created, in)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != created || got.StaffName != "岡田 葵" {
		t.Errorf("got = %+v", got)
	}
	eventID, err := calendar.EventIDOf(created)
	if err != nil {
		t.Fatal(err)
	}
	if ev := srv.Event(okadaCal, eventID); ev == nil || ev.Summary != title {
		t.Fatalf("Google の予定 = %+v", ev)
	}
	if row, ok := projectionRows(t, ctx, seedOkadaCalendar)[eventID]; !ok || row.Title != title || row.StaffID != seedOkada {
		t.Errorf("Projection の行 = %+v, ok = %v", row, ok)
	}
	records := NewCalendarEventRecordRepository(testDB)
	if r, err := records.GetForUpdate(ctx, created); err != nil || r.Version != 1 || r.Pending != nil || r.ExternalCalendarID != seedOkadaCalendar {
		t.Errorf("記録 = %+v, err = %v", r, err)
	}

	const unknown = "01M3TD000000000000000000S4"
	srv.Failures = []int{http.StatusBadGateway}
	if _, err := create.Do(ctx, seedGoogleFacility, unknown, in); !errors.Is(err, calendarwrite.ErrWriteUnknown) {
		t.Fatalf("5xx: err = %v", err)
	}
	if r, err := records.GetForUpdate(ctx, unknown); err != nil || r.Version != 0 || r.Pending == nil || r.Pending.State != calendar.PendingUnknown {
		t.Errorf("5xx の後の記録 = %+v, err = %v", r, err)
	}
}
