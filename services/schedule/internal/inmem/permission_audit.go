package inmem

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
)

// PermissionAudits は、audit.Writer のメモリ上の実装である。Err があれば書かずに返す。
type PermissionAudits struct {
	*Store
	Err error
}

// Create は、記録を Store.PermissionAudits に足す。
func (r PermissionAudits) Create(_ context.Context, a audit.Record) error {
	if r.Err != nil {
		return r.Err
	}
	r.PermissionAudits = append(r.PermissionAudits, a)
	return nil
}
