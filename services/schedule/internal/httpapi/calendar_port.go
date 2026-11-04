package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// CalendarApp は、外部のカレンダーのハンドラが使う操作である。
// 組み立ての場所が、calendar、calendarsync、calendarexport の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0031）。
type CalendarApp struct {
	ServiceAccount   func(ctx context.Context, facilityID string) (string, error)
	List             func(ctx context.Context, facilityID string) ([]calendar.ExternalCalendar, error)
	Check            func(ctx context.Context, facilityID, calendarID string) error
	Link             func(ctx context.Context, facilityID, staffID, calendarID string) (calendar.ExternalCalendar, error)
	Unlink           func(ctx context.Context, id string) error
	Preview          func(ctx context.Context, id string, rng calendar.Range) (calendar.ImportPreview, error)
	Import           func(ctx context.Context, id string, rng calendar.Range, decisions []calendar.Decision) (calendar.ImportResult, error)
	ListExportIssues func(ctx context.Context, facilityID string) ([]calendar.ExportIssue, error)
	RetryExport      func(ctx context.Context, id string) (calendar.Export, error)
	AcceptExport     func(ctx context.Context, id string) (calendar.Export, error)
}
