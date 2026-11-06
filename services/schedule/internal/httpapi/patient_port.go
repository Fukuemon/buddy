package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
)

// PatientApp は、利用者のハンドラが使う操作である。
// 組み立ての場所が、patient の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0023）。
type PatientApp struct {
	Create             func(ctx context.Context, in patient.CreateInput) (patient.Detail, error)
	Update             func(ctx context.Context, id string, in patient.UpdateInput) (patient.Detail, error)
	End                func(ctx context.Context, id string) (patient.Detail, error)
	RemainingSchedules func(ctx context.Context, id string) (patient.Remaining, error)
	Resume             func(ctx context.Context, id, assignedStaffID string) (patient.Detail, error)
	Get                func(ctx context.Context, id string) (patient.Detail, error)
	List               func(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error)
}
