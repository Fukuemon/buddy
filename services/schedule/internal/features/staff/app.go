package staff

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、App が使うリポジトリと、事業所の中の組織を読む小さなインターフェースである。
type Deps struct {
	Facilities  kernel.Finder[organization.Facility]
	Departments kernel.Finder[organization.Department]
	Teams       kernel.Finder[organization.Team]
	Positions   kernel.Finder[organization.Position]
	Policies    kernel.Finder[organization.Policy]
	Staff       Repository
	Identities  Identities
	Assignments AssignmentReader
	Calendars   CalendarDetacher
	// Self は、ctx のリクエストを送った職員の ID を返す。職員が自分を休職か退職にする操作を拒むのに使う。nil なら拒まない。
	Self func(ctx context.Context) (string, bool)
	// Now は、休職と退職で残る予定を数え始める日を決める時刻である。nil なら time.Now を使う。
	Now func() time.Time
}

// App は、職員の操作である。職員の登録、休職、復職、退職と、職員の権限と役職を変える操作は、guard が許すときだけ行う（ADR-0006）。
// 職員の登録、休職、復職、退職は、ブローカーの職員も書く（ADR-0017、ADR-0018）。
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
