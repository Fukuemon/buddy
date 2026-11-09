package schedule

import "context"

// Repository は、単発の予定とキャンセルを書く。見つからないときは apperr.ErrNotFound を返す。
// CreateCancel は、予定の更新の番号を 1 つ増やす。キャンセル済みのときは apperr.ErrConflict を返す。
// 名前を結合した予定は scheduleview が読む（ADR-0026）。
type Repository interface {
	Create(ctx context.Context, s Schedule) error
	// GetForUpdate は、トランザクションの終わりまで予定の行に排他のロックを取り、ロックを取った後の値を返す。
	// トランザクションの最初に呼ぶ。
	GetForUpdate(ctx context.Context, id string) (Stored, error)
	// Update は、ID が s.ID の予定の枠を s の値に置き換え、更新の番号を 1 つ増やす。事業所と、RecurringScheduleID と OriginalDate は変えない。予定が無くてもエラーにしない。
	Update(ctx context.Context, s Schedule) error
	CreateCancel(ctx context.Context, c Cancellation) error
	// Delete は、監査の記録 d を足し、予定 d.ScheduleID の外部の予定の対応を監査の記録に付け替えてから、予定の行と訪問の情報を消す（ADR-0040）。
	// 回を置き換えた予定でも、元の回の除外する日は消さない。
	Delete(ctx context.Context, d Deletion) error
}
