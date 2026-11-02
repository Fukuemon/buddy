// Package httpapi は、照合の HTTP の API を提供する。
// エンドポイントとレスポンスの形は openapi.yaml が正本で、server は生成した openapi.StrictServerInterface を実装する。
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"time"

	"github.com/Fukuemon/buddy/services/receipt/internal/check"
	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/services/receipt/internal/permission"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
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

// PermissionChecker は、トークンの職員が照合の権限を持つかを確認する。
// 持たないときは permission.ErrForbidden を、確認できないときはほかのエラーを返す。
type PermissionChecker interface {
	RequireReceiptCheck(ctx context.Context, token string) error
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

// GetHealthz は、{"status":"ok"} を返す。
func (s *server) GetHealthz(_ context.Context, _ openapi.GetHealthzRequestObject) (openapi.GetHealthzResponseObject, error) {
	return openapi.GetHealthz200JSONResponse{Status: openapi.Ok}, nil
}

// GetReadyz は、{"status":"ok"} を返す。依存先は起動のときに確認したので、レスポンスを返せればリクエストを受けられる。
func (s *server) GetReadyz(_ context.Context, _ openapi.GetReadyzRequestObject) (openapi.GetReadyzResponseObject, error) {
	return openapi.GetReadyz200JSONResponse{Status: openapi.Ok}, nil
}

// CreateCheck は、multipart の visits（実績の CSV）と予定を照合する。
// トークンの職員が照合の権限を持たなければ、本文を読まずに 403 を返す（ADR-0022）。
// 予定のデータソースは、schedules（予定の CSV）か month（対象の月）から Config.Sources が選ぶ。
func (s *server) CreateCheck(ctx context.Context, req openapi.CreateCheckRequestObject) (openapi.CreateCheckResponseObject, error) {
	if err := s.cfg.Permission.RequireReceiptCheck(ctx, tokenFrom(ctx)); err != nil {
		if errors.Is(err, permission.ErrForbidden) {
			return openapi.CreateCheck403JSONResponse(errorBody(openapi.Forbidden, "照合の権限がない")), nil
		}
		s.logger.ErrorContext(ctx, "照合の権限を確認できない", "error", err)
		return openapi.CreateCheck502JSONResponse(errorBody(openapi.PermissionCheckFailed, "予定の API で照合の権限を確認できない")), nil
	}
	f, err := readForm(req.Body)
	if err != nil {
		if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
			return openapi.CreateCheck413JSONResponse(errorBody(openapi.PayloadTooLarge, "本文が上限を超えている")), nil
		}
		return openapi.CreateCheck400JSONResponse(errorBody(openapi.BadRequest, "multipart/form-data の本文を読めない")), nil
	}

	visits, ok := f.files[FieldVisits]
	if !ok {
		return openapi.CreateCheck400JSONResponse(errorBody(openapi.MissingFile, "ファイルのフィールド "+FieldVisits+" がない")), nil
	}
	sreq := source.Request{Month: f.values[FieldMonth], OrgID: identityFrom(ctx).OrgID}
	sreq.Schedules, sreq.HasSchedules = f.files[FieldSchedules]
	src, err := s.cfg.Sources.Select(sreq)
	if err != nil {
		return s.selectError(ctx, err), nil
	}

	rep, err := check.Run(ctx, visits, src)
	if err != nil {
		if ie, ok := errors.AsType[*record.InputError](err); ok {
			body := errorBody(openapi.InvalidCsv, ie.Message)
			errs := csvErrors(ie.Errors)
			body.Errors = &errs
			return openapi.CreateCheck422JSONResponse(body), nil
		}
		if _, ok := errors.AsType[*check.SourceError](err); ok {
			s.logger.ErrorContext(ctx, "予定を取れない", "error", err)
			return openapi.CreateCheck502JSONResponse(errorBody(openapi.ScheduleSourceFailed, "Google カレンダーから予定を取れない")), nil
		}
		s.logger.ErrorContext(ctx, "照合に失敗した", "error", err)
		return openapi.CreateCheck500JSONResponse(errorBody(openapi.Internal, "照合に失敗した")), nil
	}
	return openapi.CreateCheck200JSONResponse(report(rep)), nil
}

func (s *server) selectError(ctx context.Context, err error) openapi.CreateCheckResponseObject {
	_, invalidMonth := errors.AsType[*source.InvalidMonthError](err)
	switch {
	case errors.Is(err, source.ErrNoSchedules):
		return openapi.CreateCheck400JSONResponse(errorBody(openapi.MissingFile,
			"ファイルのフィールド "+FieldSchedules+" か、フォームの値 "+FieldMonth+" がない"))
	case errors.Is(err, source.ErrNoOrg):
		return openapi.CreateCheck403JSONResponse(errorBody(openapi.Forbidden,
			"トークンに組織がないので、"+FieldMonth+" では照合できない"))
	case errors.Is(err, source.ErrCalendarNotConfigured):
		return openapi.CreateCheck503JSONResponse(errorBody(openapi.CalendarNotConfigured,
			"サーバーに事業所の Google カレンダーの設定がないので、"+FieldMonth+" では照合できない"))
	case invalidMonth:
		return openapi.CreateCheck400JSONResponse(errorBody(openapi.BadRequest, err.Error()))
	default:
		s.logger.ErrorContext(ctx, "予定のデータソースを選べない", "error", err)
		return openapi.CreateCheck500JSONResponse(errorBody(openapi.Internal, "照合に失敗した"))
	}
}

// form は、multipart の本文のファイルと値である。同じ名前が 2 回以上あれば、最初のものを持つ。
type form struct {
	files  map[string][]byte
	values map[string]string
}

// readForm は、mr の全てのパートを読む。ファイル名を持つパートをファイル、持たないパートを値とする。
func readForm(mr *multipart.Reader) (form, error) {
	f := form{files: map[string][]byte{}, values: map[string]string{}}
	for {
		p, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			return f, nil
		}
		if err != nil {
			return form{}, err
		}
		data, err := io.ReadAll(p)
		if err != nil {
			return form{}, err
		}
		name := p.FormName()
		if p.FileName() != "" {
			if _, dup := f.files[name]; !dup {
				f.files[name] = data
			}
		} else if _, dup := f.values[name]; !dup {
			f.values[name] = string(data)
		}
	}
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
