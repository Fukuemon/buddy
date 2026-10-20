// Package handler は、API の HTTP のハンドラと、リクエストとレスポンスの型を持つ。
package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
)

// errorResponse は、エラーのときの本文である。Code は機械が分岐に使い、Message は人が読む。
type errorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeError(c *gin.Context, log *slog.Logger, err error) {
	var ve *domain.ValidationError
	switch {
	case errors.As(err, &ve):
		c.AbortWithStatusJSON(http.StatusBadRequest, errorResponse{Code: "invalid_input", Message: ve.Message})
	case errors.Is(err, domain.ErrInvalidInput):
		c.AbortWithStatusJSON(http.StatusBadRequest, errorResponse{Code: "invalid_input", Message: err.Error()})
	case errors.Is(err, domain.ErrNotFound):
		c.AbortWithStatusJSON(http.StatusNotFound, errorResponse{Code: "not_found", Message: domain.ErrNotFound.Error()})
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

// pathID は、パスの name の値を返す。ULID でないときは 400 を書いて false を返す。
func pathID(c *gin.Context, name string) (string, bool) {
	id := c.Param(name)
	if !domain.ValidID(id) {
		badRequest(c, name+" は ULID です")
		return "", false
	}
	return id, true
}

// bindJSON は、本文を v に読み、binding のタグで検証する。誤りがあれば 400 を書いて false を返す。
func bindJSON(c *gin.Context, v any) bool {
	if err := c.ShouldBindJSON(v); err != nil {
		badRequest(c, bindMessage(err))
		return false
	}
	return true
}

func bindMessage(err error) string {
	var ves validator.ValidationErrors
	if !errors.As(err, &ves) {
		return "リクエストの本文が正しくありません: " + err.Error()
	}
	msgs := make([]string, 0, len(ves))
	for _, fe := range ves {
		msgs = append(msgs, fieldPath(fe.Namespace())+" が "+fe.Tag()+" を満たしません")
	}
	return strings.Join(msgs, "、")
}

// fieldPath は、validator の Namespace（例は "createRequest.slotRequest.VisitInfo.PatientID"）を、
// JSON の項目の道筋（例は "visit_info.patient_id"）に変える。リクエストの型と埋め込んだ型は名前が小文字で始まるので外す。
func fieldPath(namespace string) string {
	var parts []string
	for _, p := range strings.Split(namespace, ".") {
		if p == "" || unicode.IsLower([]rune(p)[0]) {
			continue
		}
		parts = append(parts, snake(p))
	}
	return strings.Join(parts, ".")
}

// snake は、"VisitCategoryIDs[0]" のような Go の項目の名前を "visit_category_ids[0]" に変える。
func snake(s string) string {
	r := []rune(s)
	var b strings.Builder
	for i, c := range r {
		if unicode.IsUpper(c) && i > 0 && (unicode.IsLower(r[i-1]) || startsWord(r, i)) {
			b.WriteByte('_')
		}
		b.WriteRune(unicode.ToLower(c))
	}
	return b.String()
}

// startsWord は、略語の続き（例は "IDs" の "D"）ではなく、r[i] から新しい語が始まるかを返す。
func startsWord(r []rune, i int) bool {
	if !unicode.IsUpper(r[i-1]) || i+1 >= len(r) || !unicode.IsLower(r[i+1]) {
		return false
	}
	pluralS := r[i+1] == 's' && (i+2 == len(r) || !unicode.IsLetter(r[i+2]))
	return !pluralS
}

// optionalQuery は、クエリの name の値を返す。空か指定がないときは nil を返す。
func optionalQuery(c *gin.Context, name string) *string {
	if v := c.Query(name); v != "" {
		return &v
	}
	return nil
}

// dateQuery は、クエリの name の日付を読む。形が誤っていれば 400 を書いて false を返す。
func dateQuery(c *gin.Context, name string) (*civil.Date, bool) {
	v := c.Query(name)
	if v == "" {
		return nil, true
	}
	d, err := civil.ParseDate(v)
	if err != nil {
		badRequest(c, name+": "+err.Error())
		return nil, false
	}
	return &d, true
}
