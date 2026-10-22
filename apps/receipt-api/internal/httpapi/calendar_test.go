package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/check"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/gcal"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/source"
)

func event(id, summary, start, end string) *calendar.Event {
	return &calendar.Event{
		Id: id, Status: "confirmed", Summary: summary,
		Start: &calendar.EventDateTime{DateTime: "2024-04-0" + start + ":00+09:00"},
		End:   &calendar.EventDateTime{DateTime: "2024-04-0" + end + ":00+09:00"},
	}
}

// calendarHandler は、testdata/schedules_utf8.csv と同じ予定と、解釈できない予定 1 件を返す偽物の Calendar API に向けた Handler を返す。
func calendarHandler(t *testing.T) http.Handler {
	t.Helper()
	srv := gcaltest.NewServer(map[string]gcaltest.Calendar{
		"staff-b@example.com": {Summary: "職員B", Pages: [][]*calendar.Event{{
			event("a", "【訪看I2】利用者A", "1T09:00", "1T09:30"),
			event("c", "【訪看I3】利用者C", "1T10:00", "1T11:00"),
			event("f", "【訪看I4】利用者F", "2T09:00", "2T09:40"),
			event("k1", "【訪看I2】利用者K", "2T15:00", "2T15:30"),
			event("k2", "【訪看I2】利用者K", "2T09:00", "2T09:30"),
			event("bad", "【訪看I2】", "3T09:00", "3T09:30"),
		}}},
		"staff-e@example.com": {Summary: "表示名", Pages: [][]*calendar.Event{{
			event("d", "【医】利用者D", "1T13:00", "1T14:00"),
			event("j", "【予防訪看Ⅰ2】利用者J", "1T15:00", "1T15:30"),
		}}},
	})
	reader := gcal.NewReader(gcaltest.Same{Svc: gcaltest.Start(t, srv)}, []gcal.Calendar{
		{ID: "staff-b@example.com", OrgID: orgSample},
		{ID: "staff-e@example.com", OrgID: orgSample, StaffName: "職員E"},
		{ID: "staff-x@example.com", OrgID: "org-other"},
	})
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{
		MaxUploadBytes: 1 << 20, Sources: source.Selector{Calendar: reader}, Verifier: fakeVerifier{},
	})
}

func postForm(t *testing.T, h http.Handler, files map[string][]byte, values map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	return postFormAs(t, h, tokenSample, files, values)
}

func postFormAs(t *testing.T, h http.Handler, token string, files map[string][]byte, values map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for field, data := range files {
		w, err := mw.CreateFormFile(field, field+".csv")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	for k, v := range values {
		if err := mw.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/checks", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestChecksCalendar(t *testing.T) {
	rec := postForm(t, calendarHandler(t), map[string][]byte{FieldVisits: testdata(t, "visits_utf8.csv")}, map[string]string{FieldMonth: "2024-04"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	var rep check.Report
	if err := json.Unmarshal(rec.Body.Bytes(), &rep); err != nil {
		t.Fatal(err)
	}
	if want := (check.Summary{Mismatch: 3, ScheduleOnly: 1, VisitOnly: 1, Match: 3}); rep.Summary != want {
		t.Errorf("Summary = %+v", rep.Summary)
	}
	csvRec := post(t, newHandler(), map[string][]byte{FieldVisits: testdata(t, "visits_utf8.csv"), FieldSchedules: testdata(t, "schedules_utf8.csv")}, "")
	var csvRep check.Report
	if err := json.Unmarshal(csvRec.Body.Bytes(), &csvRep); err != nil {
		t.Fatal(err)
	}
	// 予定の行番号は CSV にだけある。
	for _, r := range csvRep.Rows {
		if r.Schedule != nil {
			r.Schedule.Line = 0
		}
	}
	got, _ := json.Marshal(rep.Rows)
	want, _ := json.Marshal(csvRep.Rows)
	if !bytes.Equal(got, want) {
		t.Errorf("同じ予定の CSV と結果の行が違う\n got %s\nwant %s", got, want)
	}
	if len(rep.Warnings) != 1 || rep.Warnings[0].EventID != "bad" || rep.Warnings[0].CalendarID != "staff-b@example.com" {
		t.Errorf("Warnings = %+v", rep.Warnings)
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("【")) {
		t.Errorf("応答に題名が入っている: %s", rec.Body)
	}
}

func TestChecksCSVOverMonth(t *testing.T) {
	files := map[string][]byte{FieldVisits: testdata(t, "visits_utf8.csv"), FieldSchedules: testdata(t, "schedules_utf8.csv")}
	rec := postForm(t, newHandler(), files, map[string]string{FieldMonth: "2024-04"})
	if rec.Code != http.StatusOK {
		t.Fatalf("schedules があれば month によらず CSV を使う: status %d body %s", rec.Code, rec.Body)
	}
}

func TestChecksCalendarErrors(t *testing.T) {
	visits := map[string][]byte{FieldVisits: testdata(t, "visits_utf8.csv")}
	failing := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{
		MaxUploadBytes: 1 << 20,
		Sources: source.Selector{Calendar: gcal.NewReader(
			gcaltest.Same{Svc: gcaltest.Start(t, gcaltest.NewServer(nil))}, []gcal.Calendar{{ID: "unknown@example.com", OrgID: orgSample}},
		)},
		Verifier: fakeVerifier{},
	})
	tests := []struct {
		name       string
		h          http.Handler
		token      string
		values     map[string]string
		wantStatus int
		wantCode   openapi.ErrorCode
	}{
		{"schedules も month もない", calendarHandler(t), tokenSample, nil, http.StatusBadRequest, openapi.MissingFile},
		{"month の形が違う", calendarHandler(t), tokenSample, map[string]string{FieldMonth: "2024/04"}, http.StatusBadRequest, openapi.BadRequest},
		{"カレンダーの設定がない", newHandler(), tokenSample, map[string]string{FieldMonth: "2024-04"}, http.StatusServiceUnavailable, openapi.CalendarNotConfigured},
		{"組織のカレンダーがない", calendarHandler(t), tokenNoCalendar, map[string]string{FieldMonth: "2024-04"}, http.StatusServiceUnavailable, openapi.CalendarNotConfigured},
		{"トークンに組織がない", calendarHandler(t), tokenNoOrg, map[string]string{FieldMonth: "2024-04"}, http.StatusForbidden, openapi.Forbidden},
		{"Calendar API が失敗する", failing, tokenSample, map[string]string{FieldMonth: "2024-04"}, http.StatusBadGateway, openapi.ScheduleSourceFailed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := postFormAs(t, tt.h, tt.token, visits, tt.values)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status %d body %s", rec.Code, rec.Body)
			}
			var body openapi.Error
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Code != tt.wantCode || body.Message == "" {
				t.Errorf("body = %+v", body)
			}
			if bytes.Contains(rec.Body.Bytes(), []byte("example.com")) {
				t.Errorf("応答にカレンダー ID が入っている: %s", rec.Body)
			}
		})
	}
}
