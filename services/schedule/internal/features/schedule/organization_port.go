package schedule

import "context"

// FacilityLock は、事業所の行をロックする。実装は postgres.FacilityRepository である。
type FacilityLock interface {
	// Share は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
	// 職員の状態を確認してから予定を書き終えるまでの間に、職員が休職か退職になるのを防ぐ。
	// 事業所が無いときは apperr.ErrNotFound を返す。
	Share(ctx context.Context, facilityID string) error
}
