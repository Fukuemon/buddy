package patient

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、App が使うリポジトリと、ほかの機能のデータを読む小さなインターフェースである。
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

// App は、利用者の操作である。利用者の登録、変更、利用の終了、利用の再開は、guard が許すときだけ行う（ADR-0006、ADR-0021）。
type App struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
}

// NewApp は App を作る。
func NewApp(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *App {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &App{deps: deps, tx: tx, ids: ids, guard: guard}
}
