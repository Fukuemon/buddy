package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// remaining は、利用者 cur の、今日（事業所の現地の日付）以降の予定と、今日以降に終わる繰り返しの予定を返す。
// 利用の終了と RemainingSchedules が同じ一覧を返すよう、2 つともこれで作る。
func (p *App) remaining(ctx context.Context, cur Detail) (Remaining, error) {
	return p.deps.Schedules.From(ctx, cur.FacilityID, cur.ID, civil.Today(p.deps.Now()))
}

// locked は、トランザクションの中で利用者 id の事業所をロックし、ロックの後に読み直した利用者を返す。
// 利用の終了と再開を、職員の退職の担当の確認と、予定と担当の新しい割り振りと 1 つずつにする。
func (p *App) locked(ctx context.Context, id string) (Detail, error) {
	cur, err := p.deps.Patients.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := p.deps.Locks.LockFacility(ctx, cur.FacilityID); err != nil {
		return Detail{}, err
	}
	return p.deps.Patients.Get(ctx, id)
}
