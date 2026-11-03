package staff

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// AssignmentReader は、ほかの機能のデータから、職員に残る予定と担当の利用者を読む。
type AssignmentReader interface {
	// From は、事業所 facilityID の職員 staffID の、from 以降の予定と、from 以降に終わる繰り返しの予定と、担当の利用者を返す。
	From(ctx context.Context, facilityID, staffID string, from civil.Date) (Assignments, error)
}
