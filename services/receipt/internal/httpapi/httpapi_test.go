package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/receipt/internal/check"
	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
)

func newHandler() http.Handler {
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{MaxUploadBytes: 1 << 20, Verifier: fakeVerifier{}, Permission: fakePermission{}})
}

func testdata(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func multipartBody(t *testing.T, files map[string][]byte) (*bytes.Buffer, string) {
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
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf, mw.FormDataContentType()
}

func post(t *testing.T, h http.Handler, files map[string][]byte, accept string) *httptest.ResponseRecorder {
	t.Helper()
	body, ct := multipartBody(t, files)
	req := httptest.NewRequest(http.MethodPost, "/v1/checks", body)
	req.Header.Set("Content-Type", ct)
	req.Header.Set("Authorization", "Bearer "+tokenSample)
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func validFiles(t *testing.T) map[string][]byte {
	return map[string][]byte{
		FieldVisits:    testdata(t, "visits_cp932.csv"),
		FieldSchedules: testdata(t, "schedules_utf8.csv"),
	}
}

func TestHealth(t *testing.T) {
	for _, path := range []string{"/healthz", "/readyz"} {
		rec := httptest.NewRecorder()
		newHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"ok"`) {
			t.Errorf("%s: status %d body %s", path, rec.Code, rec.Body)
		}
	}
}

func TestChecksJSON(t *testing.T) {
	for _, accept := range []string{"", "application/json", "*/*", "text/plain"} {
		t.Run(accept, func(t *testing.T) {
			rec := post(t, newHandler(), validFiles(t), accept)
			if rec.Code != http.StatusOK {
				t.Fatalf("status %d body %s", rec.Code, rec.Body)
			}
			if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
				t.Errorf("Content-Type = %s", ct)
			}
			var rep check.Report
			if err := json.Unmarshal(rec.Body.Bytes(), &rep); err != nil {
				t.Fatal(err)
			}
			if want := (check.Summary{Mismatch: 3, ScheduleOnly: 1, VisitOnly: 1, Match: 3}); rep.Summary != want {
				t.Errorf("Summary = %+v", rep.Summary)
			}
		})
	}
}

func TestChecksErrors(t *testing.T) {
	badVisits := []byte("訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤\n" +
		"2024/04/01,利用者A,10:00,9:00,30,訪看I２,職員B,通常,,,,\n")
	header := "訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤\n"
	schedules := testdata(t, "schedules_utf8.csv")
	// csvError は、レスポンスの CSV の誤りを、比べやすい形にしたものである。行と列が無ければ 0 と空にする。
	type csvError struct {
		Source openapi.InputSource
		Reason openapi.InputReason
		Line   int
		Column string
	}
	tests := []struct {
		name       string
		files      map[string][]byte
		wantStatus int
		wantCode   openapi.ErrorCode
		wantErrors []csvError
	}{
		{"schedules がない", map[string][]byte{FieldVisits: testdata(t, "visits_utf8.csv")}, http.StatusBadRequest, openapi.MissingFile, nil},
		{"visits がない", map[string][]byte{FieldSchedules: schedules}, http.StatusBadRequest, openapi.MissingFile, nil},
		{"列が足りない", map[string][]byte{FieldVisits: []byte(strings.Replace(header, "提供時間,", "", 1)), FieldSchedules: schedules},
			http.StatusUnprocessableEntity, openapi.InvalidCsv, []csvError{{openapi.Visits, openapi.MissingColumn, 0, "提供時間"}}},
		{"文字コードを読めない", map[string][]byte{FieldVisits: {0x81, 0x20, 0xFF}, FieldSchedules: schedules},
			http.StatusUnprocessableEntity, openapi.InvalidCsv, []csvError{{openapi.Visits, openapi.Encoding, 0, ""}}},
		{"引用符の閉じ忘れ", map[string][]byte{FieldVisits: []byte(header + "2024/04/01,\"利用者A,10:00,10:30,30,訪看I２,職員B,通常,,,,\n"), FieldSchedules: schedules},
			http.StatusUnprocessableEntity, openapi.InvalidCsv, []csvError{{openapi.Visits, openapi.MalformedRow, 2, ""}}},
		{"行のエラー", map[string][]byte{FieldVisits: badVisits, FieldSchedules: schedules},
			http.StatusUnprocessableEntity, openapi.InvalidCsv, []csvError{{openapi.Visits, openapi.EndBeforeStart, 2, "終了時間"}}},
		{"両方の CSV の誤り", map[string][]byte{FieldVisits: badVisits, FieldSchedules: nil},
			http.StatusUnprocessableEntity, openapi.InvalidCsv, []csvError{
				{openapi.Visits, openapi.EndBeforeStart, 2, "終了時間"},
				{openapi.Schedules, openapi.EmptyFile, 0, ""},
			}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := post(t, newHandler(), tt.files, "")
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
			var got []csvError
			if body.Errors != nil {
				for _, e := range *body.Errors {
					if e.Message == "" {
						t.Errorf("message が空 = %+v", e)
					}
					c := csvError{Source: e.Source, Reason: e.Reason}
					if e.Line != nil {
						c.Line = *e.Line
					}
					if e.Column != nil {
						c.Column = *e.Column
					}
					got = append(got, c)
				}
			}
			if !reflect.DeepEqual(got, tt.wantErrors) {
				t.Errorf("errors = %+v, want %+v", got, tt.wantErrors)
			}
		})
	}
}

func TestChecksNotMultipart(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/checks", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tokenSample)
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), string(openapi.BadRequest)) {
		t.Errorf("status %d body %s", rec.Code, rec.Body)
	}
}

func TestChecksTooLarge(t *testing.T) {
	h := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{MaxUploadBytes: 100, Verifier: fakeVerifier{}, Permission: fakePermission{}})
	rec := post(t, h, validFiles(t), "")
	if rec.Code != http.StatusRequestEntityTooLarge || !strings.Contains(rec.Body.String(), string(openapi.PayloadTooLarge)) {
		t.Errorf("status %d body %s", rec.Code, rec.Body)
	}
}

func TestNotFound(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/nowhere", nil)
	req.Header.Set("Authorization", "Bearer "+tokenSample)
	newHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), string(openapi.NotFound)) {
		t.Errorf("status %d body %s", rec.Code, rec.Body)
	}
}
