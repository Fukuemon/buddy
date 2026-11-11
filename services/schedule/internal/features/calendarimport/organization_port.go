package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// FacilityLock は、事業所の行をロックする。実装は postgres.FacilityRepository である。
type FacilityLock interface {
	// GetForShare は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせず、
	// 予定の管理先を変えさせないロックを取り、事業所を返す。
	// 退職はカレンダーを外すので、職員の状態とカレンダーを外したかを読む前にロックを取ると、読んだ後に職員が休職か退職になって
	// カレンダーが外れることが無い。事業所が無いときは apperr.ErrNotFound を返す。
	GetForShare(ctx context.Context, facilityID string) (organization.Facility, error)
}

// FacilityModes は、移行の操作が、事業所の行を排他のロックで取り、予定の管理先を変える。実装は postgres.FacilityRepository である。
// 1 つのトランザクションの中で使う（ADR-0021）。
type FacilityModes interface {
	// GetForUpdate は、トランザクションが終わるまで事業所 facilityID の行に排他のロックを取り、事業所を返す。
	// 予定を書く操作と取り込みは同じ行を共有のロックで読むので、ロックを取った後に予定を書けない。事業所が無いときは apperr.ErrNotFound を返す。
	GetForUpdate(ctx context.Context, facilityID string) (organization.Facility, error)
	// ChangeSourceMode は、事業所 facilityID の予定の管理先を mode にする。
	ChangeSourceMode(ctx context.Context, facilityID string, mode organization.SourceMode) error
}
