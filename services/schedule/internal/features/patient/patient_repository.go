package patient

import "context"

// Repository は、利用者を読み書きする。見つからないときは apperr.ErrNotFound を返す。
//
// Update は、利用者の名前、希望、サービスコード、担当の職員を書き換える。利用の終了は変えない。
// End は、利用者を利用の終了にする。利用の終了の利用者を利用の終了にし直しても、最初に利用の終了にした時刻を残す。
// Resume は、利用者を利用中に戻し、担当の職員を assignedStaffID にする。
type Repository interface {
	Create(ctx context.Context, p Patient) error
	Update(ctx context.Context, p Patient) error
	End(ctx context.Context, id string) error
	Resume(ctx context.Context, id, assignedStaffID string) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error)
}

// Getter は、利用者を 1 人読む。Repository の一部である。
type Getter interface {
	Get(ctx context.Context, id string) (Detail, error)
}
