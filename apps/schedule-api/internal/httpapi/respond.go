// Package httpapi は、API の HTTP のハンドラを持つ。エンドポイントとリクエストとレスポンスの型は openapi.yaml が正本で、
// httpapi は openapi パッケージに生成したインターフェイスを実装する。
package httpapi

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
)

// bodyErrorPrefix は、本文を読めないときの 400 の文の先頭である。
const bodyErrorPrefix = "リクエストの本文が正しくありません: "

// errorResponse は、エラーのときの本文である。Code は機械が分岐に使い、Message は人が読む。
type errorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// requestError は、本文やクエリの形の誤りである。writeError が Message を 400 で返す。
type requestError struct{ message string }

func (e *requestError) Error() string { return e.message }

func invalidRequest(message string) error { return &requestError{message: message} }

func writeError(c *gin.Context, log *slog.Logger, err error) {
	var ve *domain.ValidationError
	var ce *domain.ConflictError
	var re *requestError
	switch {
	case errors.As(err, &re):
		badRequest(c, re.message)
	case errors.As(err, &ve):
		c.AbortWithStatusJSON(http.StatusBadRequest, errorResponse{Code: "invalid_input", Message: ve.Message})
	case errors.Is(err, domain.ErrInvalidInput):
		c.AbortWithStatusJSON(http.StatusBadRequest, errorResponse{Code: "invalid_input", Message: err.Error()})
	case errors.Is(err, domain.ErrForbidden):
		c.AbortWithStatusJSON(http.StatusForbidden, errorResponse{Code: "forbidden", Message: domain.ErrForbidden.Error()})
	case errors.Is(err, domain.ErrNotFound):
		c.AbortWithStatusJSON(http.StatusNotFound, errorResponse{Code: "not_found", Message: domain.ErrNotFound.Error()})
	case errors.As(err, &ce):
		c.AbortWithStatusJSON(http.StatusConflict, errorResponse{Code: "conflict", Message: ce.Message})
	case errors.Is(err, domain.ErrConflict):
		c.AbortWithStatusJSON(http.StatusConflict, errorResponse{Code: "conflict", Message: domain.ErrConflict.Error()})
	default:
		log.ErrorContext(c.Request.Context(), "request failed",
			slog.String("method", c.Request.Method), slog.String("path", c.FullPath()), slog.Any("error", err))
		c.AbortWithStatusJSON(http.StatusInternalServerError, errorResponse{Code: "internal", Message: "サーバーでエラーが発生しました"})
	}
}

// badRequest は、本文やクエリの形の誤りを 400 で返す。
func badRequest(c *gin.Context, message string) {
	c.AbortWithStatusJSON(http.StatusBadRequest, errorResponse{Code: "invalid_input", Message: message})
}

// value は、省略できるクエリの値を返す。省略されたときは空の文字列を返す。
func value[T ~string](p *T) string {
	if p == nil {
		return ""
	}
	return string(*p)
}

// nonEmpty は、省略できるクエリの値を返す。省略されたときと空のときは nil を返す。
func nonEmpty(p *string) *string {
	if p == nil || *p == "" {
		return nil
	}
	return p
}

// dateQuery は、クエリの name の日付を読む。省略されたときと空のときは nil を返す。
func dateQuery(name string, p *string) (*civil.Date, error) {
	if nonEmpty(p) == nil {
		return nil, nil
	}
	d, err := civil.ParseDate(*p)
	if err != nil {
		return nil, invalidRequest(name + ": " + err.Error())
	}
	return &d, nil
}

// bodyDate と bodyTime は、検証した本文の日付と時刻を読む。形が誤っていれば 400 になるエラーを返す。
func bodyDate(s string) (civil.Date, error) {
	d, err := civil.ParseDate(s)
	if err != nil {
		return civil.Date{}, invalidRequest(bodyErrorPrefix + err.Error())
	}
	return d, nil
}

func bodyTime(s string) (civil.Time, error) {
	t, err := civil.ParseTime(s)
	if err != nil {
		return civil.Time{}, invalidRequest(bodyErrorPrefix + err.Error())
	}
	return t, nil
}

func mapSlice[T, U any](in []T, f func(T) U) []U {
	out := make([]U, len(in))
	for i, v := range in {
		out[i] = f(v)
	}
	return out
}
