package patient

import (
	"context"
)

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
