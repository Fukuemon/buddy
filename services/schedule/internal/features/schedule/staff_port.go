package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// StaffRefs は、予定の職員を参照する。Get は、職員が見つからないときに apperr.ErrNotFound を返す。
// LockStatuses は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
// 職員の状態を確認してから予定を書き終えるまでの間に、職員が休職か退職になるのを防ぐ。
type StaffRefs interface {
	Get(ctx context.Context, id string) (staff.Ref, error)
	ListByFacility(ctx context.Context, facilityID string) ([]staff.Ref, error)
	LockStatuses(ctx context.Context, facilityID string) error
}
