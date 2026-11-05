package httpapi

import (
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"

	"github.com/Fukuemon/buddy/services/receipt/internal/check"
	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/services/receipt/internal/permission"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
	"github.com/Fukuemon/buddy/services/receipt/internal/source"
)

// CreateCheck は、multipart の visits（実績の CSV）と予定を照合する。
// トークンの職員が照合の権限を持たなければ、本文を読まずに 403 を返す（ADR-0018）。
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
