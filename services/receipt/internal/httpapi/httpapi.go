// Package httpapi は、照合の HTTP の API を提供する。
// エンドポイントとレスポンスの形は openapi.yaml が正本で、server は生成した openapi.StrictServerInterface を実装する。
package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/services/receipt/internal/source"
)

// 照合の入力を受ける multipart のフィールド名。
const (
	FieldVisits    = "visits"
	FieldSchedules = "schedules"
	// FieldMonth は、Google カレンダーから予定を取る対象の月（`2024-04`）を受けるフォームの値である。
	FieldMonth = "month"
)

// Config は、Handler の設定である。
type Config struct {
	// MaxUploadBytes は、リクエストの本文の上限のバイト数である。
	MaxUploadBytes int64
	// Sources は、リクエストから予定のデータソースを選ぶ。ゼロ値は予定の CSV だけを受ける。
	Sources source.Selector
	// Verifier は、/healthz と /readyz 以外のリクエストの access token を検証する。必須である。
	Verifier TokenVerifier
	// Permission は、照合の前に、トークンの職員が照合の権限を持つかを確認する。必須である。
	Permission PermissionChecker
	// AllowOrigins は、CORS でレスポンスを読ませる Origin である。空なら CORS のヘッダーを返さない。
	AllowOrigins []string
}

type server struct {
	logger *slog.Logger
	cfg    Config
}

var _ openapi.StrictServerInterface = (*server)(nil)

// NewHandler は、openapi.yaml の GET /healthz、GET /readyz と POST /v1/checks を持つ http.Handler を返す。
// 定義にないパスとメソッドには、404 の openapi.Error を返す。/healthz と /readyz 以外のリクエストは、cfg.Verifier でトークンを確認する。
func NewHandler(logger *slog.Logger, cfg Config) http.Handler {
	s := &server{logger: logger, cfg: cfg}
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		s.writeJSON(w, http.StatusNotFound, errorBody(openapi.NotFound, "該当する API がない"))
	})
	strict := openapi.NewStrictHandlerWithOptions(s, nil, openapi.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, _ error) {
			s.writeJSON(w, http.StatusBadRequest, errorBody(openapi.BadRequest, "multipart/form-data の本文を読めない"))
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			s.logger.ErrorContext(r.Context(), "レスポンスを書けない", "error", err)
			s.writeJSON(w, http.StatusInternalServerError, errorBody(openapi.Internal, "照合に失敗した"))
		},
	})
	openapi.HandlerWithOptions(strict, openapi.StdHTTPServerOptions{
		BaseRouter:  mux,
		Middlewares: []openapi.MiddlewareFunc{s.limitBody},
	})
	// 生成物の Middlewares は操作ごとのハンドラーだけを包むので、定義にないパスの 404 にもトークンを求めるよう mux 全体を包む。
	// panic の 500 もアクセスログに出すよう、回復はログの内側に置く。
	return s.logRequests(s.recoverPanic(s.cors(s.authenticate(mux))))
}

func errorBody(code openapi.ErrorCode, message string) openapi.Error {
	return openapi.Error{Code: code, Message: message}
}

func (s *server) limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadBytes)
		next.ServeHTTP(w, r)
	})
}

func (s *server) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		s.logger.Error("レスポンスを書けない", "error", err)
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

// Unwrap は、http.ResponseController が元の ResponseWriter の Flush などを呼べるよう、包んだ ResponseWriter を返す。
func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
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

// recoverPanic は、next の panic を回復し、panic の値とパスをエラーのログに書いて、500 の openapi.Error を返す。
// http.ErrAbortHandler は、net/http が接続を切る合図なので、回復せずにもう一度 panic する。
// レスポンスを書き始めた後の panic では、ステータスを書き直せないので、ログだけを書く。
func (s *server) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &wroteRecorder{ResponseWriter: w}
		defer func() {
			p := recover()
			if p == nil {
				return
			}
			if err, ok := p.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(p)
			}
			s.logger.ErrorContext(r.Context(), "panic", "recovered", p, "path", r.URL.Path)
			if !rec.wrote {
				s.writeJSON(w, http.StatusInternalServerError, errorBody(openapi.Internal, "照合に失敗した"))
			}
		}()
		next.ServeHTTP(rec, r)
	})
}

// wroteRecorder は、レスポンスのステータスを書いたかを覚える。
type wroteRecorder struct {
	http.ResponseWriter
	wrote bool
}

func (r *wroteRecorder) WriteHeader(status int) {
	r.wrote = true
	r.ResponseWriter.WriteHeader(status)
}

func (r *wroteRecorder) Write(b []byte) (int, error) {
	r.wrote = true
	return r.ResponseWriter.Write(b)
}

// Unwrap は、http.ResponseController が元の ResponseWriter の Flush などを呼べるよう、包んだ ResponseWriter を返す。
func (r *wroteRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}
