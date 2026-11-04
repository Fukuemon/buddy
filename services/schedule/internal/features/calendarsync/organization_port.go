package calendarsync

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// FacilityLock は、確認が必要な待ちを Google の内容で解く操作が、事業所の行をロックして読む。実装は postgres.FacilityRepository である。
type FacilityLock interface {
	// GetForShare は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせず、
	// 正本のモードを変えさせないロックを取り、事業所を返す。事業所が無いときは apperr.ErrNotFound を返す。
	GetForShare(ctx context.Context, facilityID string) (organization.Facility, error)
}
