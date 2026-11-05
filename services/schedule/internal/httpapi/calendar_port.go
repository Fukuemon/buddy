package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
)

// CalendarApp は、外部のカレンダーのハンドラが使う操作である。
// 組み立ての場所が、calendar、calendarimport、calendarsync、calendarexport の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0005）。
type CalendarApp struct {
	ServiceAccount   func(ctx context.Context, facilityID string) (string, error)
	List             func(ctx context.Context, facilityID string) ([]calendar.ExternalCalendar, error)
	Mine             func(ctx context.Context, facilityID, staffID string) (*calendar.ExternalCalendar, error)
	Check            func(ctx context.Context, facilityID, calendarID string) error
	Link             func(ctx context.Context, facilityID, staffID, calendarID string) (calendar.ExternalCalendar, error)
	Unlink           func(ctx context.Context, id string) error
	Preview          func(ctx context.Context, id string, rng calendarimport.Range) (calendarimport.ImportPreview, error)
	Import           func(ctx context.Context, id string, rng calendarimport.Range, decisions []calendarimport.Decision) (calendarimport.ImportResult, error)
	GetCutover       func(ctx context.Context, facilityID string) (calendarimport.CutoverState, error)
	StartCutover     func(ctx context.Context, facilityID string) (calendarimport.Cutover, error)
	CompleteCutover  func(ctx context.Context, id string) (calendarimport.Cutover, error)
	CancelCutover    func(ctx context.Context, id string) (calendarimport.Cutover, error)
	ListExportIssues func(ctx context.Context, facilityID string) ([]calendar.ExportIssue, error)
	RetryExport      func(ctx context.Context, id string) (calendar.Export, error)
	AcceptExport     func(ctx context.Context, id string) (calendar.Export, error)
}
