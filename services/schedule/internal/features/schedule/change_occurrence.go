package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// ChangeOccurrence は、繰り返しの予定の originalDate の回を、in の内容の単発の予定に置き換える。
// 元の回は繰り返しの予定から除外し、作った単発の予定を返す。
// 繰り返しの予定が見つからないときは apperr.ErrNotFound を、originalDate が回に当たらないときは入力のエラーを、
// その回をすでに置き換えたときは apperr.ErrConflict を返す。
func (s *Usecase) ChangeOccurrence(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in SlotInput) (Detail, error) {
	rs, err := s.deps.Recurring.Get(ctx, recurringScheduleID)
	if err != nil {
		return Detail{}, err
	}
	if err := s.authorize(ctx, rs.StaffID, true); err != nil {
		return Detail{}, err
	}
	if !rs.Occurs(originalDate) {
		return Detail{}, apperr.Invalid("%s は繰り返しの予定の回に当たりません", originalDate)
	}
	var created Detail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.deps.Recurring.AddExclusion(ctx, rs.ID, originalDate); err != nil {
			return apperr.AsConflict(err, "%s の回はすでに置き換えられています", originalDate)
		}
		var err error
		created, err = s.createSchedule(ctx, rs.FacilityID, in, &occurrence{recurringScheduleID: rs.ID, originalDate: originalDate, kept: assignedOf(rs.StaffID, rs.Visit)})
		if err != nil {
			return err
		}
		return s.recurringChanged(ctx, rs.Slot, rs.ID)
	})
	return created, err
}
