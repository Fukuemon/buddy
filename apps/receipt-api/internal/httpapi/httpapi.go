// Package httpapi は、照合の HTTP の API を提供する。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/check"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
)

// エラーの応答の code の値。
const (
	CodeBadRequest      = "bad_request"
	CodeMissingFile     = "missing_file"
	CodePayloadTooLarge = "payload_too_large"
	CodeInvalidCSV      = "invalid_csv"
	CodeNotFound        = "not_found"
	CodeInternal        = "internal"
)

// 照合の入力のファイルを受ける multipart のフィールド名。
const (
	FieldVisits    = "visits"
	FieldSchedules = "schedules"
)

// ErrorResponse は、エラーの応答の本文である。
type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	// Errors は、入力の CSV の行ごとの誤りである。CodeInvalidCSV のときだけ持つ。
	Errors []record.RowError `json:"errors,omitempty"`
}

// Config は、Handler の設定である。
type Config struct {
	// MaxUploadBytes は、POST /v1/checks の本文の上限のバイト数である。
	MaxUploadBytes int64
}

type server struct {
	logger *slog.Logger
	cfg    Config
}

// NewHandler は、次のエンドポイントを持つ http.Handler を返す。
//
//   - GET /health: {"status":"ok"} を返す。
//   - POST /v1/checks: multipart の visits（実績の CSV）と schedules（予定の CSV）を照合する。
//     結果は Accept によらず check.Report の JSON で返す。
//
// エラーは ErrorResponse の JSON で返す。
func NewHandler(logger *slog.Logger, cfg Config) http.Handler {
	s := &server{logger: logger, cfg: cfg}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("POST /v1/checks", s.checks)
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		s.writeJSON(w, http.StatusNotFound, ErrorResponse{Code: CodeNotFound, Message: "該当する API がない"})
	})
	return s.logRequests(mux)
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) checks(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadBytes)
	if err := r.ParseMultipartForm(s.cfg.MaxUploadBytes); err != nil {
		if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
			s.writeJSON(w, http.StatusRequestEntityTooLarge, ErrorResponse{
				Code: CodePayloadTooLarge, Message: "本文が上限を超えている",
			})
			return
		}
		s.writeJSON(w, http.StatusBadRequest, ErrorResponse{
			Code: CodeBadRequest, Message: "multipart/form-data の本文を読めない",
		})
		return
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()

	visits, ok := s.readFile(w, r, FieldVisits)
	if !ok {
		return
	}
	schedules, ok := s.readFile(w, r, FieldSchedules)
	if !ok {
		return
	}

	rep, err := check.Run(r.Context(), visits, check.CSVSchedules{Data: schedules})
	if err != nil {
		if ie, ok := errors.AsType[*record.InputError](err); ok {
			s.writeJSON(w, http.StatusUnprocessableEntity, ErrorResponse{
				Code: CodeInvalidCSV, Message: ie.Message, Errors: ie.Rows,
			})
			return
		}
		s.logger.ErrorContext(r.Context(), "照合に失敗した", "error", err)
		s.writeJSON(w, http.StatusInternalServerError, ErrorResponse{Code: CodeInternal, Message: "照合に失敗した"})
		return
	}

	s.writeJSON(w, http.StatusOK, rep)
}

func (s *server) readFile(w http.ResponseWriter, r *http.Request, field string) ([]byte, bool) {
	f, _, err := r.FormFile(field)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, ErrorResponse{
			Code: CodeMissingFile, Message: "ファイルのフィールド " + field + " がない",
		})
		return nil, false
	}
	defer func() { _ = f.Close() }()
	data, err := io.ReadAll(f)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, ErrorResponse{
			Code: CodeBadRequest, Message: "ファイルのフィールド " + field + " を読めない",
		})
		return nil, false
	}
	return data, true
}

func (s *server) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		s.logger.Error("応答を書けない", "error", err)
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (s *server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		s.logger.InfoContext(r.Context(), "request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}
