package calendar

import "context"

// FacilityLock は、事業所の行をロックする。実装は postgres.FacilityRepository である。
type FacilityLock interface {
	// Share は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
	// 退職はカレンダーを外すので、職員の状態とカレンダーを外したかを読む前にロックを取ると、読んだ後に職員が休職か退職になって
	// カレンダーが外れることが無い。事業所が無いときは apperr.ErrNotFound を返す。
	Share(ctx context.Context, facilityID string) error
}
