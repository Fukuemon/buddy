package patient

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// End は、利用者を利用の終了にし、利用の終了にした利用者を返す。
type End struct {
	patients  Repository
	locks     FacilityLocker
	schedules ScheduleReader
	now       func() time.Time
	tx        tx.Transactor
	guard     organization.Guard
}

// NewEnd は End を作る。
func NewEnd(patients Repository, locks FacilityLocker, schedules ScheduleReader, now func() time.Time, tx tx.Transactor, guard organization.Guard) End {
	if now == nil {
		now = time.Now
	}
	return End{patients: patients, locks: locks, schedules: schedules, now: now, tx: tx, guard: guard}
}

// Do は、利用者を利用の終了にし、利用の終了にした利用者を返す。利用の終了の利用者を利用の終了にしても成功し、最初に利用の終了にした時刻を残す。
// その日以降の予定か、その日以降に終わる繰り返しの予定が残れば、書かずに残る一覧を持つ *ScheduledError を返す（ADR-0021）。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
//
// 事業所をロックしてから残る予定を数えるので、予定の作成（事業所の共有のロックを取る）と行き違わない。
func (p End) Do(ctx context.Context, id string) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	var ended Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := locked(ctx, p.patients, p.locks, id)
		if err != nil {
			return err
		}
		if !cur.IsEnded() {
			rem, err := remaining(ctx, p.schedules, p.now, cur)
			if err != nil {
				return err
			}
			if !rem.IsEmpty() {
				return &ScheduledError{Remaining: rem}
			}
		}
		if err := p.patients.End(ctx, cur.ID); err != nil {
			return err
		}
		ended, err = p.patients.Get(ctx, cur.ID)
		return err
	})
	return ended, err
}
