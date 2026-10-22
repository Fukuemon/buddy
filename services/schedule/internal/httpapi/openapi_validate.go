package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
)

func init() {
	// kin-openapi は email の形をデフォルトでは確かめないので、登録する。職員のメールは staff.New でも確かめる
	openapi3.DefineStringFormatValidator("email", openapi3.NewRegexpFormatValidator(openapi3.FormatOfStringForEmail))
}

// maxBodyBytes は、リクエストの本文の上限である。検証は本文を全てメモリに読むので、上限を超えた本文は読まずに拒む。
const maxBodyBytes = 1 << 20

// newRequestValidator は、リクエストのパスの引数、クエリ、本文を openapi.yaml の定義で確かめる gin のミドルウェアを作る。
// 定義に合わなければ、handler を呼ばずに 400（code は invalid_input）を返す。
// トークンの確認は authenticate が受け持つので、定義の security はここでは確かめない。
// 空の値のクエリ（?date_from= など）は、ハンドラが指定なしとして扱うので、定義では確かめない。
func newRequestValidator() (gin.HandlerFunc, error) {
	spec, err := openapi.GetSpec()
	if err != nil {
		return nil, fmt.Errorf("load openapi spec: %w", err)
	}
	// servers の URL とリクエストの Host を比べないよう、外す。Host は環境ごとに違う
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
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
		in := &openapi3filter.RequestValidationInput{Request: withoutEmptyQuery(c.Request), PathParams: params, Route: route, Options: opts}
		if err := openapi3filter.ValidateRequest(c.Request.Context(), in); err != nil {
			if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
				badRequest(c, fmt.Sprintf("%s本文は %d バイトまでです", bodyErrorPrefix, maxBodyBytes))
				return
			}
			badRequest(c, requestErrorMessage(err))
			return
		}
		// 検証に渡したリクエストの本文は、kin-openapi が読み直せる形に戻している
		c.Request.Body = in.Request.Body
		c.Next()
	}, nil
}

// withoutEmptyQuery は、空の値のクエリを外したリクエストのコピーを返す。本文は r と同じものを指す。
func withoutEmptyQuery(r *http.Request) *http.Request {
	q := r.URL.Query()
	changed := false
	for k, vs := range q {
		if len(vs) == 1 && vs[0] == "" {
			q.Del(k)
			changed = true
		}
	}
	if !changed {
		return r
	}
	u := *r.URL
	u.RawQuery = q.Encode()
	c := r.Clone(r.Context())
	c.URL = &u
	c.Body = r.Body
	return c
}

// schemaErrorAt は、allOf などで包まれたエラーをたどり、一番内側のエラーの場所と理由を返す。
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

// requestErrorMessage は、定義に合わない理由を、エラーごとに項目の場所と理由の 1 つの文にして「、」でつなぐ。
func requestErrorMessage(err error) string {
	msgs := []string{}
	for _, e := range flatten(err) {
		var re *openapi3filter.RequestError
		if errors.As(e, &re) && re.Parameter != nil {
			msgs = append(msgs, re.Parameter.In+" の "+re.Parameter.Name+" が定義に合いません: "+parameterReason(re))
			continue
		}
		var se *openapi3.SchemaError
		if errors.As(e, &se) {
			path, reason := schemaErrorAt(se)
			msgs = append(msgs, path+" が定義に合いません: "+reason)
			continue
		}
		if errors.As(e, &re) && re.RequestBody != nil {
			first, _, _ := strings.Cut(re.Err.Error(), "\n")
			msgs = append(msgs, bodyErrorPrefix+first)
			continue
		}
		first, _, _ := strings.Cut(e.Error(), "\n")
		msgs = append(msgs, first)
	}
	return strings.Join(msgs, "、")
}

// flatten は、MultiError と、本文のエラーの束を包んだ RequestError を、1 つずつのエラーに開く。
func flatten(err error) []error {
	var me openapi3.MultiError
	if errors.As(err, &me) {
		var out []error
		for _, e := range me {
			out = append(out, flatten(e)...)
		}
		return out
	}
	var re *openapi3filter.RequestError
	if errors.As(err, &re) && re.Parameter == nil && errors.As(re.Err, &me) {
		return flatten(me)
	}
	return []error{err}
}

// parameterReason は、パスとクエリの引数のエラーの理由を返す。値が定義に合わないときは、その理由を使う。
func parameterReason(re *openapi3filter.RequestError) string {
	var se *openapi3.SchemaError
	if errors.As(re.Err, &se) {
		_, reason := schemaErrorAt(se)
		return reason
	}
	if re.Reason != "" {
		return re.Reason
	}
	first, _, _ := strings.Cut(re.Err.Error(), "\n")
	return first
}
