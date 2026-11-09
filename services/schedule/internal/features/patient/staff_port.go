package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// StaffRefs は、利用者の担当の職員を参照する。Get は、職員が見つからないときに apperr.ErrNotFound を返す。
type StaffRefs interface {
	Get(ctx context.Context, id string) (staff.Ref, error)
}
