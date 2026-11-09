package inmem

import (
	"context"
	"slices"
	"strings"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
)

// ServiceCodes は、servicecode.Repository のメモリ上の実装である。
type ServiceCodes struct{ *Store }

// Get は、servicecode.Repository の Get を実装する。
func (s ServiceCodes) Get(_ context.Context, id string) (servicecode.ServiceCode, error) {
	return get(s.Codes, id)
}

// List は、サービスコードを ID の順に返す。
func (s ServiceCodes) List(context.Context) ([]servicecode.ServiceCode, error) {
	out := make([]servicecode.ServiceCode, 0, len(s.Codes))
	for _, c := range s.Codes {
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b servicecode.ServiceCode) int { return strings.Compare(a.ID, b.ID) })
	return out, nil
}
