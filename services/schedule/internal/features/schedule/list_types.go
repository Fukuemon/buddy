package schedule

import (
	"context"
)

// ListTypes は、予定の種類を返す。
type ListTypes struct {
	types TypeRepository
}

// NewListTypes は ListTypes を作る。
func NewListTypes(types TypeRepository) ListTypes {
	return ListTypes{types: types}
}

// Do は、予定の種類を返す。
func (s ListTypes) Do(ctx context.Context) ([]Type, error) {
	return s.types.List(ctx)
}
