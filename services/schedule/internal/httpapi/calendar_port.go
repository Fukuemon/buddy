package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// CalendarApp は、外部のカレンダーのハンドラが使う操作である。
type CalendarApp interface {
	ServiceAccount(ctx context.Context, facilityID string) (string, error)
	List(ctx context.Context, facilityID string) ([]calendar.ExternalCalendar, error)
	Check(ctx context.Context, facilityID, calendarID string) error
	Link(ctx context.Context, facilityID, staffID, calendarID string) (calendar.ExternalCalendar, error)
	Unlink(ctx context.Context, id string) error
	Preview(ctx context.Context, id string, rng calendar.Range) (calendar.Preview, error)
	Import(ctx context.Context, id string, rng calendar.Range, decisions []calendar.Decision) (calendar.ImportResult, error)
	ListExportIssues(ctx context.Context, facilityID string) ([]calendar.ExportIssue, error)
	RetryExport(ctx context.Context, id string) (calendar.Export, error)
	AcceptExport(ctx context.Context, id string) (calendar.Export, error)
}
