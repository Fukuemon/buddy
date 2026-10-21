package schedule

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

// Repository は、単発の予定とキャンセルを読み書きする。見つからないときは apperr.ErrNotFound を返す。
// CreateCancel は、予定の更新の番号を 1 つ増やす。キャンセル済みのときは apperr.ErrConflict を返す。
type Repository interface {
	Create(ctx context.Context, s Schedule) error
	// GetForUpdate は、トランザクションの終わりまで予定の行に排他のロックを取り、ロックを取った後の値を返す。
	// トランザクションの最初に呼ぶ。
	GetForUpdate(ctx context.Context, id string) (Detail, error)
	// Update は、ID が s.ID の予定の枠を s の値に置き換え、更新の番号を 1 つ増やす。事業所と、RecurringScheduleID と OriginalDate は変えない。予定が無くてもエラーにしない。
	Update(ctx context.Context, s Schedule) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error)
	CreateCancel(ctx context.Context, c Cancel) error
}

// RecurringRepository は、繰り返しの予定と規則と、除外する日付を読み書きする。見つからないときは apperr.ErrNotFound を返す。
// AddExclusion は、繰り返しの予定の更新の番号を 1 つ増やす。同じ日付をすでに除外しているときは apperr.ErrConflict を返す。
type RecurringRepository interface {
	Create(ctx context.Context, rs RecurringSchedule) error
	Get(ctx context.Context, id string) (RecurringDetail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]RecurringDetail, error)
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
}

// TypeRepository は、予定の種類のマスタを読む。見つからないときは apperr.ErrNotFound を返す。
type TypeRepository interface {
	Get(ctx context.Context, id string) (Type, error)
	List(ctx context.Context) ([]Type, error)
}

// StaffRefs は、予定の職員を参照する。Get は、職員が見つからないときに apperr.ErrNotFound を返す。
type StaffRefs interface {
	Get(ctx context.Context, id string) (staff.Ref, error)
	ListByFacility(ctx context.Context, facilityID string) ([]staff.Ref, error)
}

// VisitInfos は、訪問の予定に付く訪問の情報を書く。実装は visit.Writer である。
type VisitInfos interface {
	Create(ctx context.Context, facilityID string, in visit.Input) (string, error)
	DeleteIfUnused(ctx context.Context, id string) error
}

// Exports は、予定の変更を、外部のカレンダーへの書き出しの待ちに積む。実装は calendar.Outbox である。
// 予定の職員が外部のカレンダーを結び付けておらず、予定に外部の予定の対応も無ければ、積まずに nil を返す。
// 予定の変更と同じトランザクションの中で呼ぶ。
type Exports interface {
	ScheduleChanged(ctx context.Context, facilityID, staffID, scheduleID string) error
	RecurringChanged(ctx context.Context, facilityID, staffID, recurringScheduleID string) error
}
