package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// StaffApp は、職員のハンドラが使う操作である。
type StaffApp interface {
	Create(ctx context.Context, in staff.CreateInput) (staff.Detail, error)
	Get(ctx context.Context, id string) (staff.Detail, error)
	List(ctx context.Context, facilityID string, q staff.ListQuery) ([]staff.Summary, error)
	ChangePosition(ctx context.Context, id, positionID string) (staff.Detail, error)
	UpdateProfile(ctx context.Context, id string, p staff.Profile) (staff.Detail, error)
	AddGrant(ctx context.Context, id string, in staff.GrantInput) (staff.Detail, error)
	RemoveGrant(ctx context.Context, id, userPolicyID string) (staff.Detail, error)
	Leave(ctx context.Context, id string, in staff.LeaveInput) (staff.StatusChange, error)
	Reinstate(ctx context.Context, id string) (staff.Detail, error)
	Retire(ctx context.Context, id string) (staff.StatusChange, error)
	RemainingAssignments(ctx context.Context, id string) (staff.Assignments, error)
}
