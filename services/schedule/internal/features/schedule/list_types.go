package schedule

import (
	"context"
)

// ListTypes は、予定の種類を返す。
func (s *Usecase) ListTypes(ctx context.Context) ([]Type, error) {
	return s.deps.Types.List(ctx)
}
