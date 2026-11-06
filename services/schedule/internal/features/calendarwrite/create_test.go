package calendarwrite_test

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

const (
	scheduleID = "01M3TC5H00QV17BC0J9V3393ZP"
	calendarID = "staff@example.com"
	externalID = "CAL"
	// calendarID2 と externalID2 は、同行者 inmem.CompanionID のカレンダーである。
	calendarID2 = "companion@example.com"
	externalID2 = "CAL2"
	patientName = "山田 花子"
	serviceCode = "訪看I3"
)

// today は、テストの Create の今日である。
var today = civil.Date{Year: 2026, Month: 10, Day: 21}

// accounts は、どの事業所にも gcaltest のフェイクで読み書きする calendar.Accounts である。
type accounts struct{ svc *calendarv3.Service }

func (accounts) ServiceAccount(context.Context, string) (string, error) { return "sa@example.com", nil }

func (a accounts) Source(context.Context, string) (calendar.EventSource, error) {
	return gcal.NewReader(a.svc), nil
}

func (a accounts) Writer(context.Context, string) (calendar.EventWriter, error) {
	return gcal.NewWriter(a.svc), nil
}

// fixture は、google_primary の事業所と、職員 inmem.StaffID のカレンダーと、Google カレンダーのフェイクである。
type fixture struct {
	store  *inmem.Store
	google *gcaltest.Server
	// svc は、google に向けた Calendar API のクライアントである。
	svc              *calendarv3.Service
	create           calendarwrite.Create
	update           calendarwrite.Update
	cancel           calendarwrite.Cancel
	createRecurring  calendarwrite.CreateRecurring
	changeOccurrence calendarwrite.ChangeOccurrence
	cancelOccurrence calendarwrite.CancelOccurrence
	// now は、Create が読む今の時刻である。
	now time.Time
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	s := inmem.Seeded()
	f := s.Facilities[inmem.FacilityID]
	f.SourceMode = organization.SourceGooglePrimary
	s.Facilities[inmem.FacilityID] = f
	for id, name := range map[string]string{inmem.StaffID: "佐藤", inmem.CompanionID: "鈴木"} {
		d := s.Staff[id]
		d.Username = name
		s.Staff[id] = d
	}
	p := s.Patients[inmem.PatientID]
	p.Name = patientName
	s.Patients[inmem.PatientID] = p
	code := s.Codes[inmem.CodeID]
	code.Code = serviceCode
	s.Codes[inmem.CodeID] = code
	s.Calendars[externalID] = calendar.ExternalCalendar{
		ID: externalID, FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Provider: calendar.ProviderGoogle, CalendarID: calendarID,
	}
	s.Calendars[externalID2] = calendar.ExternalCalendar{
		ID: externalID2, FacilityID: inmem.FacilityID, StaffID: inmem.CompanionID, Provider: calendar.ProviderGoogle, CalendarID: calendarID2,
	}
	google := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{calendarID: {nil}, calendarID2: {nil}}}
	svc := gcaltest.Start(t, google)
	fx := &fixture{store: s, google: google, svc: svc, now: today.Time().Add(9 * time.Hour)}
	ids := &inmem.SeqIDs{}
	visits := visit.NewWriter(visit.WriterDeps{
		Staff: inmem.StaffRefs{Store: s}, Patients: inmem.Patients{Store: s}, Infos: inmem.VisitInfos{Store: s},
		ServiceCodes: inmem.ServiceCodes{Store: s}, Categories: inmem.VisitCategories{Store: s},
	}, ids)
	fx.create = calendarwrite.NewCreate(inmem.Facilities{Store: s}, inmem.Projections{Store: s}, inmem.ScheduleTypes{Store: s},
		inmem.StaffRefs{Store: s}, inmem.Staff{Store: s}, visits, inmem.VisitInfos{Store: s}, inmem.Calendars{Store: s},
		inmem.CalendarEventRecords{Store: s}, inmem.Projections{Store: s}, accounts{svc}, func() time.Time { return fx.now }, &inmem.Tx{})
	fx.update = calendarwrite.NewUpdate(inmem.Facilities{Store: s}, inmem.Projections{Store: s}, inmem.ScheduleTypes{Store: s},
		inmem.StaffRefs{Store: s}, inmem.Staff{Store: s}, visits, inmem.VisitInfos{Store: s}, inmem.Calendars{Store: s},
		inmem.CalendarEventRecords{Store: s}, inmem.Projections{Store: s}, accounts{svc}, ulid.Generator{}, slog.New(slog.DiscardHandler),
		func() time.Time { return fx.now }, &inmem.Tx{})
	fx.cancel = calendarwrite.NewCancel(inmem.Facilities{Store: s}, inmem.Projections{Store: s}, inmem.StaffRefs{Store: s}, visits,
		inmem.Calendars{Store: s}, inmem.CalendarEventRecords{Store: s}, inmem.Projections{Store: s}, accounts{svc}, func() time.Time { return fx.now }, &inmem.Tx{})
	fx.createRecurring = calendarwrite.NewCreateRecurring(inmem.Facilities{Store: s}, inmem.Projections{Store: s}, inmem.ScheduleTypes{Store: s},
		inmem.StaffRefs{Store: s}, inmem.Staff{Store: s}, visits, inmem.VisitInfos{Store: s}, inmem.Calendars{Store: s},
		inmem.CalendarEventRecords{Store: s}, inmem.Projections{Store: s}, accounts{svc}, func() time.Time { return fx.now }, &inmem.Tx{})
	fx.changeOccurrence = calendarwrite.NewChangeOccurrence(inmem.Facilities{Store: s}, inmem.Projections{Store: s}, inmem.ScheduleTypes{Store: s},
		inmem.StaffRefs{Store: s}, inmem.Staff{Store: s}, visits, inmem.VisitInfos{Store: s}, inmem.Calendars{Store: s},
		inmem.CalendarEventRecords{Store: s}, inmem.Projections{Store: s}, accounts{svc}, ulid.Generator{}, slog.New(slog.DiscardHandler),
		func() time.Time { return fx.now }, &inmem.Tx{})
	fx.cancelOccurrence = calendarwrite.NewCancelOccurrence(inmem.Facilities{Store: s}, inmem.Projections{Store: s}, inmem.StaffRefs{Store: s}, visits,
		inmem.Calendars{Store: s}, inmem.CalendarEventRecords{Store: s}, inmem.Projections{Store: s}, accounts{svc}, func() time.Time { return fx.now }, &inmem.Tx{})
	return fx
}

// editorCtx は、事業所の全ての予定を編集できる職員を持つ ctx を返す。
func editorCtx() context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: principal.Staff{
		ID: "EDITOR", FacilityID: inmem.FacilityID,
		Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}},
	}})
}

func visitSlot() schedule.SlotInput {
	return schedule.SlotInput{
		TypeID: inmem.VisitTypeID, Date: civil.Date{Year: 2026, Month: 10, Day: 22},
		StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, StaffID: inmem.StaffID,
		Visit: &visit.Input{
			PatientID: inmem.PatientID, AssignedStaffID: inmem.StaffID, CompanionID: ptr(inmem.CompanionID),
			ServiceCodeID: inmem.CodeID, CategoryIDs: []string{inmem.CategoryID},
		},
	}
}

func normalSlot() schedule.SlotInput {
	in := visitSlot()
	in.TypeID, in.Visit, in.Title = inmem.NormalTypeID, nil, ptr("カンファレンス")
	return in
}

func ptr[T any](v T) *T { return &v }

func eventID(t *testing.T) string {
	t.Helper()
	id, err := calendar.EventIDOf(scheduleID)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

// isConflict は、err が code の 409 かを返す。
func isConflict(err error, code string) bool {
	var ce *apperr.ConflictError
	return errors.As(err, &ce) && ce.Code == code
}

func (fx *fixture) record(t *testing.T) (calendar.EventRecord, bool) {
	t.Helper()
	r, ok := fx.store.Records[scheduleID]
	return r, ok
}

// pendingVisit は、記録の保留の版の訪問の情報の ID を返す。保留の版か訪問の情報が無ければ止める。
func (fx *fixture) pendingVisit(t *testing.T) string {
	t.Helper()
	r, ok := fx.record(t)
	if !ok || r.Pending == nil || r.Pending.VisitInfoID == nil {
		t.Fatalf("保留の版の訪問の情報が無い: %+v", r)
	}
	return *r.Pending.VisitInfoID
}

func (fx *fixture) projection(t *testing.T) (scheduleview.Projection, bool) {
	t.Helper()
	p, ok := fx.store.Projections[inmem.ProjectionKey{ExternalCalendarID: externalID, EventID: eventID(t)}]
	return p, ok
}

// TestCreateVisit は、訪問の予定を作ると、Google カレンダーに `【サービス内容】利用者名` の予定ができ、
// Projection の行と、訪問の情報を確定した記録ができることを確認する。
func TestCreateVisit(t *testing.T) {
	fx := newFixture(t)
	got, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot())
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != scheduleID || got.Source != scheduleview.SourceGoogleCalendar || got.Visit == nil || got.Visit.PatientName != patientName ||
		got.StaffName != "佐藤" || got.Visit.CompanionName == nil || *got.Visit.CompanionName != "鈴木" {
		t.Errorf("got = %+v, visit = %+v", got, got.Visit)
	}
	ev := fx.google.Event(calendarID, eventID(t))
	if ev == nil {
		t.Fatal("Google カレンダーに予定が無い")
	}
	if ev.Summary != gcaltitle.Format(serviceCode, patientName) ||
		ev.ExtendedProperties.Private[calendar.PropScheduleID] != scheduleID || ev.ExtendedProperties.Private[calendar.PropVersion] != "1" {
		t.Errorf("Google の予定 = %q, private = %v", ev.Summary, ev.ExtendedProperties.Private)
	}
	p, ok := fx.projection(t)
	if !ok || p.Status != scheduleview.ProjectionConfirmed || p.Title != ev.Summary || p.StaffID != inmem.StaffID || p.ETag != ev.Etag {
		t.Errorf("Projection = %+v, ok = %v", p, ok)
	}
	r, ok := fx.record(t)
	if !ok || r.Version != 1 || r.Pending != nil || r.VisitInfoID == nil || r.ExternalEventID != eventID(t) || r.ExternalCalendarID != externalID {
		t.Fatalf("記録 = %+v, ok = %v", r, ok)
	}
	if info := fx.store.Infos[*r.VisitInfoID]; info.PatientID != inmem.PatientID || info.CompanionID == nil {
		t.Errorf("訪問の情報 = %+v", info)
	}
}

// TestCreateNormal は、通常の予定にも、訪問の情報の無い記録を作ることを確認する。
func TestCreateNormal(t *testing.T) {
	fx := newFixture(t)
	if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, normalSlot()); err != nil {
		t.Fatal(err)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); ev == nil || ev.Summary != "カンファレンス" {
		t.Errorf("Google の予定 = %+v", ev)
	}
	if r, ok := fx.record(t); !ok || r.Version != 1 || r.VisitInfoID != nil || r.Pending != nil {
		t.Errorf("記録 = %+v, ok = %v", r, ok)
	}
}

// TestCreateFailures は、Google のエラーごとに、応答のエラーと保留の版の扱いを確認する。
// 結果が分からない 5xx は保留の版と訪問の情報を残し、拒んだことが確かな 4xx は記録と訪問の情報を消す。
func TestCreateFailures(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		wantErr     func(error) bool
		wantPending bool
	}{
		{name: "5xx", status: http.StatusServiceUnavailable, wantErr: func(err error) bool { return errors.Is(err, calendarwrite.ErrWriteUnknown) }, wantPending: true},
		{name: "412", status: http.StatusPreconditionFailed, wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeEventChanged) }},
		{name: "400", status: http.StatusBadRequest, wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeEventRejected) }},
		{name: "403", status: http.StatusForbidden, wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeCalendarUnwritable) }},
		{name: "404", status: http.StatusNotFound, wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeEventNotFound) }},
		{name: "429", status: http.StatusTooManyRequests, wantErr: func(err error) bool { return errors.Is(err, calendarwrite.ErrGoogleUnavailable) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fx := newFixture(t)
			fx.google.Failures = []int{tt.status}
			_, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot())
			if !tt.wantErr(err) {
				t.Fatalf("err = %v", err)
			}
			r, ok := fx.record(t)
			if tt.wantPending {
				if !ok || r.Version != 0 || r.Pending == nil || r.Pending.State != calendar.PendingUnknown || r.Pending.VisitInfoID == nil {
					t.Fatalf("記録 = %+v, ok = %v", r, ok)
				}
				if _, ok := fx.store.Infos[*r.Pending.VisitInfoID]; !ok {
					t.Errorf("保留の版の訪問の情報が消えた")
				}
			} else if ok {
				t.Errorf("記録が残った: %+v", r)
			}
			if !tt.wantPending && len(fx.store.Infos) != 0 {
				t.Errorf("訪問の情報が残った: %v", fx.store.Infos)
			}
			if _, ok := fx.projection(t); ok {
				t.Errorf("Projection の行ができた")
			}
		})
	}
}

// TestCreateResend は、同じ予定の ID で送り直したときに、Google の予定が 1 つのままで、内容が同じなら成功し、
// 違えば google_event_changed を返すことを確認する。
func TestCreateResend(t *testing.T) {
	t.Run("書けた後に応答が失われ、同じ内容で送り直す", func(t *testing.T) {
		fx := newFixture(t)
		fx.google.LostResponses = []int{http.StatusBadGateway}
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); !errors.Is(err, calendarwrite.ErrWriteUnknown) {
			t.Fatalf("1 回目: err = %v", err)
		}
		first := fx.pendingVisit(t)
		got, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot())
		if err != nil {
			t.Fatalf("2 回目: err = %v", err)
		}
		if got.Visit == nil || got.Visit.ID != first || got.Visit.PatientName != patientName {
			t.Errorf("got = %+v", got.Visit)
		}
		if n := len(fx.google.Events(calendarID)); n != 1 {
			t.Errorf("Google の予定の数 = %d, want 1", n)
		}
		r, ok := fx.record(t)
		if !ok || r.Version != 1 || r.Pending != nil || r.VisitInfoID == nil || *r.VisitInfoID != first {
			t.Fatalf("記録 = %+v, want 最初の訪問の情報 %s で確定", r, first)
		}
		if len(fx.store.Infos) != 1 {
			t.Errorf("訪問の情報の数 = %d, want 1（送り直しの入力から作った訪問の情報を消す）", len(fx.store.Infos))
		}
		if _, ok := fx.projection(t); !ok {
			t.Errorf("Projection の行が無い")
		}
	})
	t.Run("書けた後に応答が失われ、違う内容で送り直す", func(t *testing.T) {
		fx := newFixture(t)
		fx.google.LostResponses = []int{http.StatusInternalServerError}
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); !errors.Is(err, calendarwrite.ErrWriteUnknown) {
			t.Fatalf("1 回目: err = %v", err)
		}
		first := fx.pendingVisit(t)
		in := visitSlot()
		in.StartTime, in.EndTime = civil.Time{Hour: 11}, civil.Time{Hour: 12}
		in.Visit.CompanionID, in.Visit.CategoryIDs = nil, nil
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, in); !isConflict(err, calendarwrite.CodeEventChanged) {
			t.Fatalf("2 回目: err = %v", err)
		}
		if n := len(fx.google.Events(calendarID)); n != 1 {
			t.Errorf("Google の予定の数 = %d, want 1", n)
		}
		r, ok := fx.record(t)
		if !ok || r.Version != 1 || r.Pending != nil || r.VisitInfoID == nil || *r.VisitInfoID != first {
			t.Fatalf("記録 = %+v, want 最初の訪問の情報 %s で確定", r, first)
		}
		if info := fx.store.Infos[first]; info.CompanionID == nil || len(info.CategoryIDs) != 1 || len(fx.store.Infos) != 1 {
			t.Errorf("訪問の情報 = %+v（%d 件）, want Google が受けた最初の入力のもの 1 件", info, len(fx.store.Infos))
		}
		if p, ok := fx.projection(t); !ok || p.Start.At == nil || p.Start.At.In(calendar.Tokyo).Hour() != 9 {
			t.Errorf("Projection = %+v（Google の今の予定を写す）", p)
		}
	})
	t.Run("書けなかった後に送り直す", func(t *testing.T) {
		fx := newFixture(t)
		fx.google.Failures = []int{http.StatusServiceUnavailable}
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); !errors.Is(err, calendarwrite.ErrWriteUnknown) {
			t.Fatalf("1 回目: err = %v", err)
		}
		first := fx.pendingVisit(t)
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); !isConflict(err, calendarwrite.CodeWritePending) {
			t.Fatalf("書く期限の前: err = %v, want %s", err, calendarwrite.CodeWritePending)
		}
		if r, _ := fx.record(t); r.Pending == nil || r.Pending.Version != 1 || r.Pending.VisitInfoID == nil || *r.Pending.VisitInfoID != first ||
			len(fx.store.Infos) != 1 {
			t.Errorf("書く期限の前の記録 = %+v, 訪問の情報 %d 件, want 保留の版を変えない", r, len(fx.store.Infos))
		}
		fx.now = fx.now.Add(calendarwrite.WriteDeadline)
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); err != nil {
			t.Fatalf("書く期限の後: err = %v", err)
		}
		r, _ := fx.record(t)
		if r.Version != 2 || r.Pending != nil || r.VisitInfoID == nil || *r.VisitInfoID == first {
			t.Errorf("記録 = %+v, want 次の版で作り直す", r)
		}
		if len(fx.store.Infos) != 1 {
			t.Errorf("訪問の情報の数 = %d, want 1（最初の保留の版の訪問の情報を消す）", len(fx.store.Infos))
		}
		if n := len(fx.google.Events(calendarID)); n != 1 {
			t.Errorf("Google の予定の数 = %d, want 1", n)
		}
		if ev := fx.google.Event(calendarID, eventID(t)); ev == nil || ev.ExtendedProperties.Private[calendar.PropVersion] != "2" {
			t.Errorf("Google の予定 = %+v", ev)
		}
	})
	t.Run("結果が分からない後に Google で版の違う予定が見つかる", func(t *testing.T) {
		fx := newFixture(t)
		fx.google.LostResponses = []int{http.StatusBadGateway}
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); !errors.Is(err, calendarwrite.ErrWriteUnknown) {
			t.Fatalf("1 回目: err = %v", err)
		}
		fx.google.Edit(calendarID, eventID(t), func(ev *calendarv3.Event) { ev.ExtendedProperties.Private[calendar.PropVersion] = "9" })
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); !isConflict(err, calendarwrite.CodeEventChanged) {
			t.Fatalf("書く期限の前: err = %v", err)
		}
		if r, ok := fx.record(t); !ok || r.Pending == nil {
			t.Errorf("書く期限の前の記録 = %+v, want 保留の版を残す", r)
		}
		fx.now = fx.now.Add(calendarwrite.WriteDeadline)
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); !isConflict(err, calendarwrite.CodeEventChanged) {
			t.Fatalf("書く期限の後: err = %v", err)
		}
		if r, ok := fx.record(t); ok {
			t.Errorf("書く期限の後の記録 = %+v, want 消す", r)
		}
		if len(fx.store.Infos) != 0 {
			t.Errorf("訪問の情報の数 = %d, want 0", len(fx.store.Infos))
		}
	})
	t.Run("作れた後に送り直す", func(t *testing.T) {
		fx := newFixture(t)
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); err != nil {
			t.Fatal(err)
		}
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); err != nil {
			t.Fatalf("同じ内容: err = %v", err)
		}
		if w := fx.google.Writes(); w != 1 {
			t.Errorf("書き込みの数 = %d, want 1", w)
		}
		if len(fx.store.Infos) != 1 {
			t.Errorf("訪問の情報の数 = %d, want 1", len(fx.store.Infos))
		}
		fx.google.Edit(calendarID, eventID(t), func(ev *calendarv3.Event) { ev.Summary = "【訪看I3】別の人" })
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, visitSlot()); !isConflict(err, calendarwrite.CodeEventChanged) {
			t.Errorf("Google で変えた後: err = %v", err)
		}
		if p, _ := fx.projection(t); p.Title != "【訪看I3】別の人" {
			t.Errorf("Projection のタイトル = %q", p.Title)
		}
	})
	t.Run("書いている途中に送り直す", func(t *testing.T) {
		fx := newFixture(t)
		fx.store.Records[scheduleID] = calendar.EventRecord{
			ScheduleID: scheduleID, FacilityID: inmem.FacilityID, ExternalCalendarID: externalID, ExternalEventID: eventID(t),
			Pending: &calendar.PendingWrite{Version: 1, State: calendar.PendingWriting, Deadline: fx.now.Add(time.Minute)},
		}
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, normalSlot()); !isConflict(err, calendarwrite.CodeWritePending) {
			t.Fatalf("err = %v", err)
		}
		if w := fx.google.Writes(); w != 0 {
			t.Errorf("書き込みの数 = %d, want 0", w)
		}
		fx.now = fx.now.Add(calendarwrite.WriteDeadline)
		if _, err := fx.create.Do(editorCtx(), inmem.FacilityID, scheduleID, normalSlot()); err != nil {
			t.Errorf("書く期限の後: err = %v", err)
		}
	})
}

// TestCreateRejects は、Google に書かずに拒む場合を確認する。
func TestCreateRejects(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(fx *fixture)
		ctx     context.Context
		id      string
		wantErr func(error) bool
	}{
		{
			name:    "主訪問者にカレンダーが無い",
			prepare: func(fx *fixture) { delete(fx.store.Calendars, externalID) },
			wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeCalendarNotLinked) },
		},
		{
			name: "外したカレンダー",
			prepare: func(fx *fixture) {
				c := fx.store.Calendars[externalID]
				c.DisabledAt = ptr(fx.now)
				fx.store.Calendars[externalID] = c
			},
			wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeCalendarNotLinked) },
		},
		{
			name: "open の切り替えがある",
			prepare: func(fx *fixture) {
				fx.store.Cutovers["CUT"] = calendarimport.Cutover{ID: "CUT", FacilityID: inmem.FacilityID, Status: calendarimport.CutoverOpen}
			},
			wantErr: func(err error) bool { return isConflict(err, calendarwrite.CodeCutoverOpen) },
		},
		{
			name: "buddy_primary の事業所",
			prepare: func(fx *fixture) {
				f := fx.store.Facilities[inmem.FacilityID]
				f.SourceMode = organization.SourceBuddyPrimary
				fx.store.Facilities[inmem.FacilityID] = f
			},
			wantErr: func(err error) bool { return errors.Is(err, apperr.ErrConflict) },
		},
		{
			name: "予定の職員の予定を編集できない",
			ctx: principal.With(context.Background(), principal.Principal{Staff: principal.Staff{
				ID: inmem.CompanionID, FacilityID: inmem.FacilityID, Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleSelfEdit}},
			}}),
			wantErr: func(err error) bool { return errors.Is(err, apperr.ErrForbidden) },
		},
		{name: "予定の ID が無い", id: "-", wantErr: func(err error) bool { return errors.Is(err, apperr.ErrInvalidInput) }},
		{name: "予定の ID が ULID でない", id: "NOT-ULID", wantErr: func(err error) bool { return errors.Is(err, apperr.ErrInvalidInput) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fx := newFixture(t)
			if tt.prepare != nil {
				tt.prepare(fx)
			}
			ctx := tt.ctx
			if ctx == nil {
				ctx = editorCtx()
			}
			id := scheduleID
			switch tt.id {
			case "":
			case "-":
				id = ""
			default:
				id = tt.id
			}
			if _, err := fx.create.Do(ctx, inmem.FacilityID, id, visitSlot()); !tt.wantErr(err) {
				t.Fatalf("err = %v", err)
			}
			if w := fx.google.Writes(); w != 0 {
				t.Errorf("Google への書き込みの数 = %d, want 0", w)
			}
			if _, ok := fx.record(t); ok {
				t.Errorf("記録ができた")
			}
		})
	}
}
