package patient

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// remaining は、利用者 cur の、今日（事業所の現地の日付）以降の予定と、今日以降に終わる繰り返しの予定を返す。
// 利用の終了と RemainingSchedules が同じ一覧を返すよう、2 つともこれで作る。
func remaining(ctx context.Context, schedules ScheduleReader, now func() time.Time, cur Detail) (Remaining, error) {
	return schedules.From(ctx, cur.FacilityID, cur.ID, civil.Today(now()))
}

// locked は、トランザクションの中で利用者 id の事業所をロックし、ロックの後に読み直した利用者を返す。
// 利用の終了と再開を、職員の退職の担当の確認と、予定と担当の新しい割り振りと 1 つずつにする。
func locked(ctx context.Context, patients Repository, locks FacilityLocker, id string) (Detail, error) {
	cur, err := patients.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := locks.LockFacility(ctx, cur.FacilityID); err != nil {
		return Detail{}, err
	}
	return patients.Get(ctx, id)
}
