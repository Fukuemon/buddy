package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// Update は、単発の予定の枠を in の内容に置き換える。訪問の情報は in の内容で作り直し、前の訪問の情報は消す。
// 予定が見つからないときは apperr.ErrNotFound を、キャンセル済みのときは apperr.ErrConflict を、
// 参照が見つからないか別の事業所のものであるときは入力のエラーを返す。
func (s *Usecase) Update(ctx context.Context, scheduleID string, in SlotInput) (Detail, error) {
	var updated Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.deps.Schedules.GetForUpdate(ctx, scheduleID)
		if err != nil {
			return err
		}
		if err := s.requireScheduleAccess(ctx, cur.StaffID, true); err != nil {
			return err
		}
		if cur.Cancel != nil {
			return apperr.Conflict("キャンセル済みの予定は変えられません")
		}
		slot, typ, err := s.prepareSlot(ctx, cur.FacilityID, in, assignedOf(cur.StaffID, cur.Visit))
		if err != nil {
			return err
		}
		sc, err := New(cur.ID, slot, typ)
		if err != nil {
			return err
		}
		if err := s.deps.Schedules.Update(ctx, sc); err != nil {
			return err
		}
		if cur.VisitInfoID != nil {
			if err := s.deps.Visits.DeleteIfUnused(ctx, *cur.VisitInfoID); err != nil {
				return err
			}
		}
		// 職員が替わったときも、前の職員のカレンダーの予定は対応から消せるので、新しい職員で積む。
		if err := s.scheduleChanged(ctx, sc.Slot, sc.ID); err != nil {
			return err
		}
		updated, err = s.deps.Schedules.Get(ctx, cur.ID)
		return err
	})
	return updated, err
}
