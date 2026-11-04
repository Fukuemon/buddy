package servicecode

import "context"

// List は、すべてのサービスコードを返す。
type List struct {
	codes Repository
}

// NewList は List を作る。
func NewList(codes Repository) List {
	return List{codes: codes}
}

// Do は、すべてのサービスコードを返す。
func (o List) Do(ctx context.Context) ([]ServiceCode, error) {
	return o.codes.List(ctx)
}
