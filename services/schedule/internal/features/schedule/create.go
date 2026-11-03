package schedule

import (
	"context"
)

// Create は、事業所に単発の予定を作る。訪問の情報があれば同じトランザクションで保存する。
// 事業所が見つからないときは apperr.ErrNotFound を、参照が見つからないか別の事業所のものであるときは入力のエラーを返す。
func (s *App) Create(ctx context.Context, facilityID string, in SlotInput) (Detail, error) {
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return Detail{}, err
	}
	var created Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		created, err = s.createSchedule(ctx, facilityID, in, nil)
		return err
	})
	return created, err
}
