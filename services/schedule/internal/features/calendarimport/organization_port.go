package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// FacilityLock は、事業所の行をロックする。実装は postgres.FacilityRepository である。
type FacilityLock interface {
	// GetForShare は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせず、
	// 正本のモードを変えさせないロックを取り、事業所を返す。
	// 退職はカレンダーを外すので、職員の状態とカレンダーを外したかを読む前にロックを取ると、読んだ後に職員が休職か退職になって
	// カレンダーが外れることが無い。事業所が無いときは apperr.ErrNotFound を返す。
	GetForShare(ctx context.Context, facilityID string) (organization.Facility, error)
}
