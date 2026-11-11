package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/receipt/internal/httpapi/openapi"
)

// GetHealthz は、{"status":"ok"} を返す。
func (s *server) GetHealthz(_ context.Context, _ openapi.GetHealthzRequestObject) (openapi.GetHealthzResponseObject, error) {
	return openapi.GetHealthz200JSONResponse{Status: openapi.Ok}, nil
}

// GetReadyz は、cfg.Ready が nil を返せば {"status":"ok"} を、エラーを返せば 503 の {"status":"unavailable"} を返す。
func (s *server) GetReadyz(ctx context.Context, _ openapi.GetReadyzRequestObject) (openapi.GetReadyzResponseObject, error) {
	if s.cfg.Ready != nil {
		if err := s.cfg.Ready(ctx); err != nil {
			s.logger.WarnContext(ctx, "リクエストを受けられない", "error", err)
			return openapi.GetReadyz503JSONResponse{Status: openapi.Unavailable}, nil
		}
	}
	return openapi.GetReadyz200JSONResponse{Status: openapi.Ok}, nil
}
