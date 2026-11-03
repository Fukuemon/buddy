package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// StaffLocker は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
// 実装は schedule.StaffRefs と同じ postgres.StaffRefRepository である。退職はカレンダーを外すので、職員の状態と
// カレンダーを外したかを読む前にロックを取ると、読んだ後に職員が休職か退職になってカレンダーが外れることが無い。
type StaffLocker interface {
	LockStatuses(ctx context.Context, facilityID string) error
}

// StaffRefs は、カレンダーを結び付ける職員と、その状態を読む。
type StaffRefs interface {
	kernel.Finder[staff.Ref]
	StaffLocker
}
