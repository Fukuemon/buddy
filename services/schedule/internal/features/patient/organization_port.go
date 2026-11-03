package patient

import "context"

// FacilityLocker は、事業所の職員と利用者の状態を変える操作を 1 つずつにする。実装は postgres.StaffRepository である。
type FacilityLocker interface {
	// LockFacility は、トランザクションが終わるまで、事業所 facilityID の職員の休職と退職、予定と担当の新しい割り振りを、
	// ほかのトランザクションに待たせる。事業所が無いときは apperr.ErrNotFound を返す。
	LockFacility(ctx context.Context, facilityID string) error
}
