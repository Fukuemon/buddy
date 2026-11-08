package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// RecurringRepository は、繰り返しの予定と規則と、除外する日付を書く。見つからないときは apperr.ErrNotFound を返す。
// AddExclusion は、繰り返しの予定の更新の番号を 1 つ増やす。同じ日付をすでに除外しているときは apperr.ErrConflict を返す。
// 名前を結合した繰り返しの予定は scheduleview が読む（ADR-0026）。
type RecurringRepository interface {
	Create(ctx context.Context, rs RecurringSchedule) error
	// GetForUpdate は、トランザクションの終わりまで繰り返しの予定の行に排他のロックを取り、ロックを取った後の値を返す。
	// トランザクションの最初に呼ぶ。
	GetForUpdate(ctx context.Context, id string) (StoredRecurring, error)
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
	// UpdateRule は、繰り返しの予定 rs.ID の最初の日付と規則を rs の値で上書きし、更新の番号を 1 つ増やす。ほかの項目は変えない。
	UpdateRule(ctx context.Context, rs RecurringSchedule) error
	// RemoveUnreplacedExclusions は、繰り返しの予定 recurringScheduleID の from 以降の除外する日のうち、
	// その日の回を置き換えた単発の予定が無い日を消す。取り消した回を、規則を変えた後の回に引き継がないためである（ADR-0037）。
	RemoveUnreplacedExclusions(ctx context.Context, recurringScheduleID string, from civil.Date) error
	// ReplacedDates は、繰り返しの予定 recurringScheduleID の回を置き換えた単発の予定（キャンセルしたものを含む）のうち、
	// 元の回の日付が from 以降のものの日付を、古い順に返す。
	ReplacedDates(ctx context.Context, recurringScheduleID string, from civil.Date) ([]civil.Date, error)
}
