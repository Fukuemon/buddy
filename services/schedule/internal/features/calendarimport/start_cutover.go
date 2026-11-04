package calendarimport

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// StartCutover は、事業所の予定の正本を Google カレンダーから buddy に切り替える作業（切り替え）を始める（ADR-0035）。
type StartCutover struct {
	facilities FacilityModes
	syncs      scheduleview.CalendarSyncs
	cutovers   CutoverRepository
	tx         tx.Transactor
	ids        kernel.IDGenerator
	now        func() time.Time
	guard      organization.Guard
}

// NewStartCutover は StartCutover を作る。now が nil なら time.Now を使う。
func NewStartCutover(facilities FacilityModes, syncs scheduleview.CalendarSyncs, cutovers CutoverRepository, tx tx.Transactor, ids kernel.IDGenerator, now func() time.Time, guard organization.Guard) StartCutover {
	if now == nil {
		now = time.Now
	}
	return StartCutover{facilities: facilities, syncs: syncs, cutovers: cutovers, tx: tx, ids: ids, now: now, guard: guard}
}

// Do は、事業所 facilityID の open の切り替えを作って返す。取り込みの期間は、今の Asia/Tokyo の月の初日から先の全てにする。
// 事業所の行を排他のロックで取り、事業所が Google カレンダーを予定の正本にしていて、外していない全てのカレンダーの最後の同期が
// 成功していることを確認する。事業所が buddy を予定の正本にしているとき（code は CodeCutoverNotGooglePrimary）、
// open の切り替えがあるとき（CodeCutoverOpen）、最後の同期が成功していないカレンダーがあるとき（CodeCutoverSyncNotReady）は
// apperr.ErrConflict を返す。事業所が無いときは apperr.ErrNotFound を返す。
func (u StartCutover) Do(ctx context.Context, facilityID string) (Cutover, error) {
	if err := u.guard(ctx); err != nil {
		return Cutover{}, err
	}
	p, ok := principal.From(ctx)
	if !ok {
		return Cutover{}, fmt.Errorf("%w: 職員を特定できません", apperr.ErrForbidden)
	}
	c := Cutover{
		ID: u.ids.NewID(), FacilityID: facilityID, Status: CutoverOpen, RangeStart: cutoverRangeStart(u.now()), StartedBy: p.Staff.ID,
	}
	var out Cutover
	err := u.tx.WithinTx(ctx, func(ctx context.Context) error {
		f, err := u.facilities.GetForUpdate(ctx, facilityID)
		if err != nil {
			return err
		}
		if f.SourceMode != organization.SourceGooglePrimary {
			return apperr.ConflictCode(CodeCutoverNotGooglePrimary, "この事業所の予定の正本は、すでに buddy です")
		}
		if _, err := u.cutovers.FindOpen(ctx, facilityID); err == nil {
			return errCutoverAlreadyOpen
		} else if !errors.Is(err, apperr.ErrNotFound) {
			return err
		}
		if err := u.requireSynced(ctx, facilityID); err != nil {
			return err
		}
		if err := u.cutovers.Create(ctx, c); err != nil {
			if errors.Is(err, apperr.ErrConflict) {
				return errCutoverAlreadyOpen
			}
			return err
		}
		out, err = u.cutovers.Get(ctx, c.ID)
		return err
	})
	return out, err
}

var errCutoverAlreadyOpen = apperr.ConflictCode(CodeCutoverOpen, "この事業所では、切り替えをすでに始めています")

// requireSynced は、事業所の外していない全てのカレンダーの最後の同期が成功していることを確認する。
// 成功していないカレンダーがあれば、職員の名前を並べた、code が CodeCutoverSyncNotReady の apperr.ErrConflict を返す。
func (u StartCutover) requireSynced(ctx context.Context, facilityID string) error {
	syncs, err := u.syncs.ListSyncsByFacility(ctx, facilityID)
	if err != nil {
		return err
	}
	var names []string
	for _, s := range syncs {
		if s.LastStatus != scheduleview.SyncSucceeded {
			names = append(names, s.StaffName)
		}
	}
	if len(names) > 0 {
		return apperr.ConflictCode(CodeCutoverSyncNotReady, "最後の同期が成功していないカレンダーがあります（%s）。同期が成功してから始めてください", strings.Join(names, "、"))
	}
	return nil
}
