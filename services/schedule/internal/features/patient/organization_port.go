package patient

import "context"

// FacilityLock は、事業所の行をロックし、事業所の職員と利用者の状態を変える操作を 1 つずつにする。実装は postgres.FacilityRepository である。
type FacilityLock interface {
	// Lock は、トランザクションが終わるまで、事業所 facilityID の職員の休職と退職、予定と担当の新しい割り振りを、
	// ほかのトランザクションに待たせる。事業所が無いときは apperr.ErrNotFound を返す。
	Lock(ctx context.Context, facilityID string) error
	// Share は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
	// 事業所が無いときは apperr.ErrNotFound を返す。
	Share(ctx context.Context, facilityID string) error
}
