package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
)

// GetHealthz は、{"status":"ok"} を返す。
func (s *server) GetHealthz(_ context.Context, _ openapi.GetHealthzRequestObject) (openapi.GetHealthzResponseObject, error) {
	return openapi.GetHealthz200JSONResponse{Status: openapi.Ok}, nil
}

// GetReadyz は、{"status":"ok"} を返す。依存先は起動のときに確認したので、レスポンスを返せればリクエストを受けられる。
func (s *server) GetReadyz(_ context.Context, _ openapi.GetReadyzRequestObject) (openapi.GetReadyzResponseObject, error) {
	return openapi.GetReadyz200JSONResponse{Status: openapi.Ok}, nil
}
