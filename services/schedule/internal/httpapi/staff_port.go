package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// StaffApp は、職員のハンドラが使う操作である。
// 組み立ての場所が、staff の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0031）。
type StaffApp struct {
	Create               func(ctx context.Context, in staff.CreateInput) (staff.Detail, error)
	Get                  func(ctx context.Context, id string) (staff.Detail, error)
	List                 func(ctx context.Context, facilityID string, q staff.ListQuery) ([]staff.Summary, error)
	ChangePosition       func(ctx context.Context, id, positionID string) (staff.Detail, error)
	UpdateProfile        func(ctx context.Context, id string, p staff.Profile) (staff.Detail, error)
	AddGrant             func(ctx context.Context, id string, in staff.GrantInput) (staff.Detail, error)
	RemoveGrant          func(ctx context.Context, id, userPolicyID string) (staff.Detail, error)
	Leave                func(ctx context.Context, id string, in staff.LeaveInput) (staff.StatusChange, error)
	Reinstate            func(ctx context.Context, id string) (staff.Detail, error)
	Retire               func(ctx context.Context, id string) (staff.StatusChange, error)
	RemainingAssignments func(ctx context.Context, id string) (staff.Assignments, error)
}
