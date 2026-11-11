package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CancelCutover は、移行をやめる（ADR-0031）。
type CancelCutover struct {
	facilities FacilityModes
	cutovers   CutoverRepository
	tx         tx.Transactor
	guard      kernel.Guard
}

// NewCancelCutover は CancelCutover を作る。
func NewCancelCutover(facilities FacilityModes, cutovers CutoverRepository, tx tx.Transactor, guard kernel.Guard) CancelCutover {
	return CancelCutover{facilities: facilities, cutovers: cutovers, tx: tx, guard: guard}
}

// Do は、移行 id の取り込みで作った buddy の予定と予定の対応を消し、移行を canceled にして返す。
// 事業所の予定の管理先は google_primary のままで、画面と照合は Projection を読み続ける。
// 事業所の行を排他のロックで取るので、進んでいる取り込みは、やめた後に書くトランザクションで拒まれる。
// 移行が無いときは apperr.ErrNotFound を、open でないときは code が CodeCutoverNotOpen の apperr.ErrConflict を返す。
func (u CancelCutover) Do(ctx context.Context, id string) (Cutover, error) {
	if err := u.guard(ctx); err != nil {
		return Cutover{}, err
	}
	var out Cutover
	err := u.tx.WithinTx(ctx, func(ctx context.Context) error {
		c, err := lockOpen(ctx, u.facilities, u.cutovers, id)
		if err != nil {
			return err
		}
		links, err := u.cutovers.ListLinks(ctx, c.ID)
		if err != nil {
			return err
		}
		if err := u.cutovers.DeleteImported(ctx, links); err != nil {
			return err
		}
		out, err = u.cutovers.Finish(ctx, c.ID, CutoverCanceled)
		return err
	})
	return out, err
}

// lockOpen は、移行 id の事業所の行を排他のロックで取ってから、移行を読み直し、open なら返す。トランザクションの中で呼ぶ。
// 移行が無いときは apperr.ErrNotFound を、open でないときは code が CodeCutoverNotOpen の apperr.ErrConflict を返す。
func lockOpen(ctx context.Context, facilities FacilityModes, cutovers CutoverRepository, id string) (Cutover, error) {
	c, err := cutovers.Get(ctx, id)
	if err != nil {
		return Cutover{}, err
	}
	if _, err := facilities.GetForUpdate(ctx, c.FacilityID); err != nil {
		return Cutover{}, err
	}
	if c, err = cutovers.Get(ctx, id); err != nil {
		return Cutover{}, err
	}
	if c.Status != CutoverOpen {
		return Cutover{}, errCutoverNotOpen
	}
	return c, nil
}

var errCutoverNotOpen = apperr.ConflictCode(CodeCutoverNotOpen, "この移行は、すでに完了したか、やめています")
