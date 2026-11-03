package schedule

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、App が使うリポジトリと、ほかの機能のデータを読む小さなインターフェースである。
type Deps struct {
	Facilities kernel.Finder[organization.Facility]
	Staff      StaffRefs
	Visits     VisitInfos
	Schedules  Repository
	Recurring  RecurringRepository
	Types      TypeRepository
	// Exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
	Exports Exports
	// Now は、退職した職員を割り振ったまま保存できる予定の日付を決める時刻である。nil なら time.Now を使う。
	Now func() time.Time
}

// App は、予定の操作である。操作は、ctx の職員（principal.Principal）の権限で判定する。
// 見てよくない予定は一覧から除き、1 件を指す操作には apperr.ErrForbidden を返す。ctx に職員がいなければ apperr.ErrForbidden を返す。
type App struct {
	deps Deps
	tx   tx.Transactor
	ids  kernel.IDGenerator
}

// NewApp は App を作る。
func NewApp(deps Deps, tx tx.Transactor, ids kernel.IDGenerator) *App {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &App{deps: deps, tx: tx, ids: ids}
}
