package schedule

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Create は、事業所に単発の予定を作る。
type Create struct {
	facilities kernel.Finder[organization.Facility]
	schedules  Repository
	types      TypeRepository
	staff      StaffRefs
	locks      FacilityLock
	visits     VisitInfos
	now        func() time.Time
	exports    Exports
	tx         tx.Transactor
	ids        kernel.IDGenerator
}

// NewCreate は Create を作る。exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
// now は、退職した職員を割り振ったまま保存できる予定の日付を決める時刻である。nil なら time.Now を使う。
func NewCreate(facilities kernel.Finder[organization.Facility], schedules Repository, types TypeRepository, staff StaffRefs, locks FacilityLock, visits VisitInfos, now func() time.Time, exports Exports, tx tx.Transactor, ids kernel.IDGenerator) Create {
	if now == nil {
		now = time.Now
	}
	return Create{facilities: facilities, schedules: schedules, types: types, staff: staff, locks: locks, visits: visits, now: now, exports: exports, tx: tx, ids: ids}
}

// Do は、事業所に単発の予定を作り、書いた予定を返す。訪問の情報があれば同じトランザクションで保存する。
// 事業所が見つからないときは apperr.ErrNotFound を、事業所が予定を buddy で管理していないときは code が CodeGooglePrimary の
// apperr.ErrConflict を、参照が見つからないか別の事業所のものであるときは入力のエラーを返す。
func (s Create) Do(ctx context.Context, facilityID string, in SlotInput) (Schedule, error) {
	if _, err := s.facilities.Get(ctx, facilityID); err != nil {
		return Schedule{}, err
	}
	var created Schedule
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := lockWritable(ctx, s.locks, facilityID); err != nil {
			return err
		}
		var err error
		created, err = createSchedule(ctx, s.schedules, s.ids, s.types, s.staff, s.visits, s.now, s.exports, facilityID, in, nil)
		return err
	})
	return created, err
}
