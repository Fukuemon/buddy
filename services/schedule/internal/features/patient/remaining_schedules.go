package patient

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// RemainingSchedules は、利用者の、今日（事業所の現地の日付）以降の予定と、今日以降に終わる繰り返しの予定を返す。
type RemainingSchedules struct {
	patients  Repository
	schedules ScheduleReader
	now       func() time.Time
	guard     kernel.Guard
}

// NewRemainingSchedules は RemainingSchedules を作る。
func NewRemainingSchedules(patients Repository, schedules ScheduleReader, now func() time.Time, guard kernel.Guard) RemainingSchedules {
	if now == nil {
		now = time.Now
	}
	return RemainingSchedules{patients: patients, schedules: schedules, now: now, guard: guard}
}

// Do は、利用者の、今日（事業所の現地の日付）以降の予定と、今日以降に終わる繰り返しの予定を返す。何も書かない。
// 利用の終了を確定する前に、画面が残る一覧を示すのに使う。一覧は、利用の終了と同じ remaining で作る。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (p RemainingSchedules) Do(ctx context.Context, id string) (Remaining, error) {
	if err := p.guard(ctx); err != nil {
		return Remaining{}, err
	}
	cur, err := p.patients.Get(ctx, id)
	if err != nil {
		return Remaining{}, err
	}
	return remaining(ctx, p.schedules, p.now, cur)
}
