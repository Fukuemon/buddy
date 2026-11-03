package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// ScheduleReader は、予定のデータから、利用者に残る予定を読む。
type ScheduleReader interface {
	// From は、事業所 facilityID の利用者 patientID の、from 以降の予定と、from 以降に終わる繰り返しの予定を返す。
	From(ctx context.Context, facilityID, patientID string, from civil.Date) (Remaining, error)
}
