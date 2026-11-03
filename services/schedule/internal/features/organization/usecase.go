package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、Usecase が使うリポジトリである。
type Deps struct {
	Facilities  FacilityRepository
	Departments DepartmentRepository
	Teams       TeamRepository
	Positions   PositionRepository
	Policies    PolicyRepository
}

// Guard は、ctx の職員が職員の管理（StaffManage）を許されているかを確認し、許されないときは apperr.ErrForbidden を返す。
// principal が organization と staff に依存するので、機能のパッケージは principal の判定を import せずに受け取る（ADR-0006）。
type Guard func(ctx context.Context) error

// Usecase は、事業所、部署、チーム、役職、権限の操作である。
// 事業所ごとの一覧は、事業所が見つからないときに apperr.ErrNotFound を返す。
// 役職とチームの作成は、guard が許すときだけ行う。役職はデフォルトの権限を職員に配り、チームはチームを対象にする権限の範囲を決めるためである。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard Guard) *Usecase {
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard}
}
