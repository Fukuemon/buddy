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

// CreateInput は、利用者の作成の入力である。
type CreateInput struct {
	FacilityID      string
	Name            string
	PreferredTime   PreferredTime
	PreferredGender PreferredGender
	ServiceCodeID   string
	AssignedStaffID string
}

// Create は、利用者を作る。事業所が見つからないときは apperr.ErrNotFound を、
// サービスコードか担当の職員が見つからないか、職員が別の事業所に属するときは入力のエラーを返す。
// 担当の職員が休職か退職のときも入力のエラーを返す（ADR-0018）。職員の管理の権限が無いときは apperr.ErrForbidden を返す。
// 予定の作成と同じく、担当の職員の状態を確認する前に、事業所の職員の休職と退職をトランザクションの終わりまで待たせる。
func (p *Usecase) Create(ctx context.Context, in CreateInput) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	if _, err := p.deps.Facilities.Get(ctx, in.FacilityID); err != nil {
		return Detail{}, err
	}
	if _, err := p.deps.ServiceCodes.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return Detail{}, apperr.Reference("サービスコード", in.ServiceCodeID, err)
	}
	var created Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := p.deps.Staff.LockStatuses(ctx, in.FacilityID); err != nil {
			return err
		}
		if err := p.assignable(ctx, in.AssignedStaffID, in.FacilityID); err != nil {
			return err
		}
		pa, err := New(Patient{
			ID:              p.ids.NewID(),
			FacilityID:      in.FacilityID,
			Name:            in.Name,
			PreferredTime:   in.PreferredTime,
			PreferredGender: in.PreferredGender,
			ServiceCodeID:   in.ServiceCodeID,
			AssignedStaffID: in.AssignedStaffID,
		})
		if err != nil {
			return err
		}
		if err := p.deps.Patients.Create(ctx, pa); err != nil {
			return err
		}
		created, err = p.deps.Patients.Get(ctx, pa.ID)
		return err
	})
	return created, err
}

// UpdateInput は、利用者の変更の入力である。値は全て置き換える。
type UpdateInput struct {
	Name            string
	PreferredTime   PreferredTime
	PreferredGender PreferredGender
	ServiceCodeID   string
	AssignedStaffID string
}

// Update は、利用者の名前、希望、サービスコード、担当の職員を in の値にし、変えた利用者を返す。利用の終了の利用者も変えられ、利用の終了は変えない。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、
// サービスコードか担当の職員が見つからないか、職員が別の事業所に属するときは入力のエラーを返す。
// 担当を別の職員に変えるときは、休職か退職の職員を入力のエラーで拒む。今の担当のままなら、休職か退職でも拒まない。
// 予定の既に割り振った職員と同じく、担当の職員の休職と退職が、担当を変えない変更を止めないようにする（ADR-0018）。
// 担当は、事業所の共有のロックの後に読み直した利用者と比べる。ロックの前に読んだ担当と比べると、同時の再開が書いた担当を見落とし、退職した職員を確認せずに担当へ戻すためである。
func (p *Usecase) Update(ctx context.Context, id string, in UpdateInput) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	if _, err := p.deps.ServiceCodes.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return Detail{}, apperr.Reference("サービスコード", in.ServiceCodeID, err)
	}
	var updated Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := p.deps.Patients.Get(ctx, id)
		if err != nil {
			return err
		}
		if err := p.deps.Staff.LockStatuses(ctx, cur.FacilityID); err != nil {
			return err
		}
		if cur, err = p.deps.Patients.Get(ctx, id); err != nil {
			return err
		}
		if in.AssignedStaffID != cur.AssignedStaffID {
			if err := p.assignable(ctx, in.AssignedStaffID, cur.FacilityID); err != nil {
				return err
			}
		}
		pa, err := New(Patient{
			ID:              cur.ID,
			FacilityID:      cur.FacilityID,
			Name:            in.Name,
			PreferredTime:   in.PreferredTime,
			PreferredGender: in.PreferredGender,
			ServiceCodeID:   in.ServiceCodeID,
			AssignedStaffID: in.AssignedStaffID,
			EndedAt:         cur.EndedAt,
		})
		if err != nil {
			return err
		}
		if err := p.deps.Patients.Update(ctx, pa); err != nil {
			return err
		}
		updated, err = p.deps.Patients.Get(ctx, pa.ID)
		return err
	})
	return updated, err
}

// assignable は、職員 staffID が事業所 facilityID にいて、担当を新しく割り振れるかを確認する。
// 見つからないか別の事業所の職員か、休職か退職の職員なら入力のエラーを返す。
func (p *Usecase) assignable(ctx context.Context, staffID, facilityID string) error {
	st, err := p.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return apperr.Reference("職員", staffID, err)
	}
	if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
		return err
	}
	return st.Assignable()
}

// End は、利用者を利用の終了にし、利用の終了にした利用者を返す。利用の終了の利用者を利用の終了にしても成功し、最初に利用の終了にした時刻を残す。
// その日以降の予定か、その日以降に終わる繰り返しの予定が残れば、書かずに残る一覧を持つ *ScheduledError を返す（ADR-0021）。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
//
// 事業所をロックしてから残る予定を数えるので、予定の作成（事業所の共有のロックを取る）と行き違わない。
func (p *Usecase) End(ctx context.Context, id string) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	var ended Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := p.locked(ctx, id)
		if err != nil {
			return err
		}
		if !cur.Ended() {
			rem, err := p.remaining(ctx, cur)
			if err != nil {
				return err
			}
			if !rem.Empty() {
				return &ScheduledError{Remaining: rem}
			}
		}
		if err := p.deps.Patients.End(ctx, cur.ID); err != nil {
			return err
		}
		ended, err = p.deps.Patients.Get(ctx, cur.ID)
		return err
	})
	return ended, err
}

// RemainingSchedules は、利用者の、今日（事業所の現地の日付）以降の予定と、今日以降に終わる繰り返しの予定を返す。何も書かない。
// 利用の終了を確定する前に、画面が残る一覧を示すのに使う。一覧は、利用の終了と同じ remaining で作る。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (p *Usecase) RemainingSchedules(ctx context.Context, id string) (Remaining, error) {
	if err := p.guard(ctx); err != nil {
		return Remaining{}, err
	}
	cur, err := p.deps.Patients.Get(ctx, id)
	if err != nil {
		return Remaining{}, err
	}
	return p.remaining(ctx, cur)
}

// remaining は、利用者 cur の、今日（事業所の現地の日付）以降の予定と、今日以降に終わる繰り返しの予定を返す。
// 利用の終了と RemainingSchedules が同じ一覧を返すよう、2 つともこれで作る。
func (p *Usecase) remaining(ctx context.Context, cur Detail) (Remaining, error) {
	return p.deps.Schedules.From(ctx, cur.FacilityID, cur.ID, civil.Today(p.deps.Now()))
}

// Resume は、利用者を利用中に戻し（利用の再開）、担当の職員を assignedStaffID にして、戻した利用者を返す。利用中の利用者を戻しても成功し、担当を書き換える。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 職員が見つからないか、別の事業所の職員か、休職か退職の職員のときは入力のエラーを返す（ADR-0021）。
// 利用の終了の間に担当の職員が退職することがあるので、再開では担当を必ず決め直す。
func (p *Usecase) Resume(ctx context.Context, id, assignedStaffID string) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	var resumed Detail
	err := p.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := p.locked(ctx, id)
		if err != nil {
			return err
		}
		if err := p.assignable(ctx, assignedStaffID, cur.FacilityID); err != nil {
			return err
		}
		if err := p.deps.Patients.Resume(ctx, cur.ID, assignedStaffID); err != nil {
			return err
		}
		resumed, err = p.deps.Patients.Get(ctx, cur.ID)
		return err
	})
	return resumed, err
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

// Get は、利用者を返す。利用の終了の利用者も返す。
// 利用者が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (p *Usecase) Get(ctx context.Context, id string) (Detail, error) {
	if err := p.guard(ctx); err != nil {
		return Detail{}, err
	}
	return p.deps.Patients.Get(ctx, id)
}

// List は、事業所の利用者を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (p *Usecase) List(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error) {
	if _, err := p.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return p.deps.Patients.ListByFacility(ctx, facilityID, q)
}
