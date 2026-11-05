package schedule

import "context"

// Repository は、単発の予定とキャンセルを書く。見つからないときは apperr.ErrNotFound を返す。
// CreateCancel は、予定の更新の番号を 1 つ増やす。キャンセル済みのときは apperr.ErrConflict を返す。
// 名前を結合した予定は scheduleview が読む（ADR-0009）。
type Repository interface {
	Create(ctx context.Context, s Schedule) error
	// GetForUpdate は、トランザクションの終わりまで予定の行に排他のロックを取り、ロックを取った後の値を返す。
	// トランザクションの最初に呼ぶ。
	GetForUpdate(ctx context.Context, id string) (Stored, error)
	// Update は、ID が s.ID の予定の枠を s の値に置き換え、更新の番号を 1 つ増やす。事業所と、RecurringScheduleID と OriginalDate は変えない。予定が無くてもエラーにしない。
	Update(ctx context.Context, s Schedule) error
	CreateCancel(ctx context.Context, c Cancellation) error
}
