package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
)

// PatientApp は、利用者のハンドラが使う操作である。
type PatientApp interface {
	Create(ctx context.Context, in patient.CreateInput) (patient.Detail, error)
	Update(ctx context.Context, id string, in patient.UpdateInput) (patient.Detail, error)
	End(ctx context.Context, id string) (patient.Detail, error)
	RemainingSchedules(ctx context.Context, id string) (patient.Remaining, error)
	Resume(ctx context.Context, id, assignedStaffID string) (patient.Detail, error)
	Get(ctx context.Context, id string) (patient.Detail, error)
	List(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error)
}
