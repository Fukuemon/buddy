package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// StaffRefs は、予定の職員を参照する。Get は、職員が見つからないときに apperr.ErrNotFound を返す。
type StaffRefs interface {
	Get(ctx context.Context, id string) (staff.Ref, error)
	ListByFacility(ctx context.Context, facilityID string) ([]staff.Ref, error)
}
