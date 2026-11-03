package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// StaffRefs は、利用者の担当の職員を参照する。Get は、職員が見つからないときに apperr.ErrNotFound を返す。
// LockStatuses は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
type StaffRefs interface {
	Get(ctx context.Context, id string) (staff.Ref, error)
	LockStatuses(ctx context.Context, facilityID string) error
}
