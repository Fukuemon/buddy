package scheduleview

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
)

// Patients は、Projection の予定のタイトルの利用者名で引く、事業所の利用者を読む。
type Patients interface {
	ListByFacility(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error)
}
