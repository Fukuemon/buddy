package patient

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// ServiceCodes は、利用者のデフォルトのサービスコードを確認する。見つからないときは apperr.ErrNotFound を返す。
type ServiceCodes interface {
	GetServiceCode(ctx context.Context, id string) (visit.ServiceCode, error)
}

// StaffRefs は、利用者の担当の職員を参照する。Get は、職員が見つからないときに apperr.ErrNotFound を返す。
// LockStatuses は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
type StaffRefs interface {
	Get(ctx context.Context, id string) (staff.Ref, error)
	LockStatuses(ctx context.Context, facilityID string) error
}

// FacilityLocker は、事業所の職員と利用者の状態を変える操作を 1 つずつにする。実装は postgres.StaffRepository である。
type FacilityLocker interface {
	// LockFacility は、トランザクションが終わるまで、事業所 facilityID の職員の休職と退職、予定と担当の新しい割り振りを、
	// ほかのトランザクションに待たせる。事業所が無いときは apperr.ErrNotFound を返す。
	LockFacility(ctx context.Context, facilityID string) error
}

// Deps は、Usecase が使うリポジトリと、ほかの機能のデータを読む小さなインターフェイスである。
type Deps struct {
	Facilities   kernel.Finder[organization.Facility]
	Staff        StaffRefs
	ServiceCodes ServiceCodes
	Patients     Repository
	Schedules    ScheduleReader
	Locks        FacilityLocker
	// Now は、利用の終了で残る予定を数え始める日を決める時刻である。nil なら time.Now を使う。
	Now func() time.Time
}

// Usecase は、利用者の操作である。利用者の登録、変更、利用の終了、利用の再開は、guard が許すときだけ行う（ADR-0006、ADR-0021）。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *Usecase {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard}
}

// requireAssignable は、職員 staffID が事業所 facilityID にいて、担当を新しく割り振れるかを確認する。
// 見つからないか別の事業所の職員か、休職か退職の職員なら入力のエラーを返す。
func (p *Usecase) requireAssignable(ctx context.Context, staffID, facilityID string) error {
	st, err := p.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return apperr.Reference("職員", staffID, err)
	}
	if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
		return err
	}
	return st.RequireAssignable()
}

// remaining は、利用者 cur の、今日（事業所の現地の日付）以降の予定と、今日以降に終わる繰り返しの予定を返す。
// 利用の終了と RemainingSchedules が同じ一覧を返すよう、2 つともこれで作る。
func (p *Usecase) remaining(ctx context.Context, cur Detail) (Remaining, error) {
	return p.deps.Schedules.From(ctx, cur.FacilityID, cur.ID, civil.Today(p.deps.Now()))
}

// locked は、トランザクションの中で利用者 id の事業所をロックし、ロックの後に読み直した利用者を返す。
// 利用の終了と再開を、職員の退職の担当の確認と、予定と担当の新しい割り振りと 1 つずつにする。
func (p *Usecase) locked(ctx context.Context, id string) (Detail, error) {
	cur, err := p.deps.Patients.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := p.deps.Locks.LockFacility(ctx, cur.FacilityID); err != nil {
		return Detail{}, err
	}
	return p.deps.Patients.Get(ctx, id)
}

// ScheduleReader は、予定のデータから、利用者に残る予定を読む。
type ScheduleReader interface {
	// From は、事業所 facilityID の利用者 patientID の、from 以降の予定と、from 以降に終わる繰り返しの予定を返す。
	From(ctx context.Context, facilityID, patientID string, from civil.Date) (Remaining, error)
}
