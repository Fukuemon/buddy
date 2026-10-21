package httpapi

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi/openapi"
)

// newRequestValidator は、要求のパスの引数、クエリ、本文を openapi.yaml の定義で確かめる gin のミドルウェアを作る。
// 定義に合わなければ、handler を呼ばずに 400（code は invalid_input）を返す。
// トークンの確認は authenticate が受け持つので、定義の security はここでは確かめない。
func newRequestValidator() (gin.HandlerFunc, error) {
	spec, err := openapi.GetSwagger()
	if err != nil {
		return nil, fmt.Errorf("load openapi spec: %w", err)
	}
	// servers の URL と要求の Host を比べないよう、外す。Host は環境ごとに違う
	spec.Servers = nil
	router, err := gorillamux.NewRouter(spec)
	if err != nil {
		return nil, fmt.Errorf("build openapi router: %w", err)
	}
	opts := &openapi3filter.Options{AuthenticationFunc: openapi3filter.NoopAuthenticationFunc, MultiError: true}
	return func(c *gin.Context) {
		route, params, err := router.FindRoute(c.Request)
		if err != nil {
			// 定義に無い経路とメソッドは、gin のルーターが 404 と 405 を返す
			if !errors.Is(err, routers.ErrPathNotFound) && !errors.Is(err, routers.ErrMethodNotAllowed) {
				badRequest(c, "リクエストが定義に合いません: "+err.Error())
				return
			}
			c.Next()
			return
		}
		in := &openapi3filter.RequestValidationInput{Request: c.Request, PathParams: params, Route: route, Options: opts}
		if err := openapi3filter.ValidateRequest(c.Request.Context(), in); err != nil {
			badRequest(c, requestErrorMessage(err))
			return
		}
		c.Next()
	}, nil
}

// schemaErrorAt は、allOf などで包まれた誤りをたどり、一番内側の誤りの場所と理由を返す。
// 場所は、本文の先頭からの項目を「.」で、配列の位置を「[n]」でつなぐ（例は visit_info.visit_category_ids[0]）。
func schemaErrorAt(se *openapi3.SchemaError) (string, string) {
	for {
		var inner *openapi3.SchemaError
		if !errors.As(se.Origin, &inner) {
			break
		}
		se = inner
	}
	var b strings.Builder
	for _, p := range se.JSONPointer() {
		if _, err := strconv.Atoi(p); err == nil {
			b.WriteString("[" + p + "]")
			continue
		}
		if b.Len() > 0 {
			b.WriteString(".")
		}
		b.WriteString(p)
	}
	return b.String(), se.Reason
}

// requestErrorMessage は、定義に合わない理由を、項目の場所と理由の 1 行ずつにして「、」でつなぐ。
func requestErrorMessage(err error) string {
	var me openapi3.MultiError
	if !errors.As(err, &me) {
		me = openapi3.MultiError{err}
	}
	msgs := make([]string, 0, len(me))
	for _, e := range me {
		var se *openapi3.SchemaError
		if errors.As(e, &se) {
			path, reason := schemaErrorAt(se)
			msgs = append(msgs, path+" が定義に合いません: "+reason)
			continue
		}
		var re *openapi3filter.RequestError
		if errors.As(e, &re) && re.Parameter != nil {
			msgs = append(msgs, re.Parameter.In+" の "+re.Parameter.Name+" が定義に合いません: "+re.Reason)
			continue
		}
		first, _, _ := strings.Cut(e.Error(), "\n")
		msgs = append(msgs, first)
	}
	return strings.Join(msgs, "、")
}
