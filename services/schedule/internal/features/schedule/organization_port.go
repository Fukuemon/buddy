package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// FacilityLock は、事業所の行をロックする。実装は postgres.FacilityRepository である。
type FacilityLock interface {
	// GetForShare は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせず、
	// 予定の管理先を変えさせないロックを取り、事業所を返す。
	// 職員の状態とモードを確認してから予定を書き終えるまでの間に、職員が休職か退職になるのと、モードが変わるのを防ぐ。
	// 事業所が無いときは apperr.ErrNotFound を返す。
	GetForShare(ctx context.Context, facilityID string) (organization.Facility, error)
}
