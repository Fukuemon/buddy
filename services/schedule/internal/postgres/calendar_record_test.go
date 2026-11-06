package postgres

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
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
	rec := calendarwrite.Record{
		ScheduleID: scheduleID, FacilityID: seedFacility, ExternalCalendarID: calID, ExternalEventID: "ev1",
		Pending: &calendarwrite.Pending{Version: 1, State: calendarwrite.PendingWriting, VisitInfoID: ptr(infoID), Deadline: deadline},
	}
	if err := r.Create(ctx, rec); err != nil {
		t.Fatal(err)
	}
	got, err := r.GetForUpdate(ctx, scheduleID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != 0 || got.VisitInfoID != nil || got.Pending == nil || got.Pending.Version != 1 || got.Pending.State != calendarwrite.PendingWriting ||
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
	if r, err := records.GetForUpdate(ctx, unknown); err != nil || r.Version != 0 || r.Pending == nil || r.Pending.State != calendarwrite.PendingUnknown {
		t.Errorf("5xx の後の記録 = %+v, err = %v", r, err)
	}
}
