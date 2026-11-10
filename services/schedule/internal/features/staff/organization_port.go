package staff

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// SetupFacilityFunc は、organization.SetupFacility の Do である。呼び出し側のトランザクションの中で、事業所、役職、部署、チームを無ければ書く。
type SetupFacilityFunc func(ctx context.Context, in organization.SetupFacilityInput) (organization.FacilitySetup, error)

// FacilityLock は、事業所の行をロックし、事業所の職員の状態を変える操作を 1 つずつにする。実装は postgres.FacilityRepository である。
type FacilityLock interface {
	// Lock は、トランザクションが終わるまで、事業所 facilityID の職員の休職、退職、役職とチームを変える操作、権限を外す操作と、
	// 予定と担当の新しい割り振りを、ほかのトランザクションに待たせる。事業所が無いときは apperr.ErrNotFound を返す。
	Lock(ctx context.Context, facilityID string) error
}
