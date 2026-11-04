package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// OrganizationApp は、事業所、部署、チーム、役職、権限のハンドラが使う操作である。
// 組み立ての場所が、organization の操作の型の Do を入れる。入れていない操作を呼ぶと panic する（ADR-0031）。
type OrganizationApp struct {
	GetFacility      func(ctx context.Context, id string) (organization.Facility, error)
	GetDepartment    func(ctx context.Context, id string) (organization.Department, error)
	ListDepartments  func(ctx context.Context, facilityID string) ([]organization.Department, error)
	CreateDepartment func(ctx context.Context, facilityID, name string) (organization.Department, error)
	UpdateDepartment func(ctx context.Context, id, name string) (organization.Department, error)
	GetTeam          func(ctx context.Context, id string) (organization.Team, error)
	ListTeams        func(ctx context.Context, facilityID string) ([]organization.Team, error)
	CreateTeam       func(ctx context.Context, facilityID, name string, color organization.TeamColor) (organization.Team, error)
	UpdateTeam       func(ctx context.Context, id, name string, color organization.TeamColor) (organization.Team, error)
	GetPosition      func(ctx context.Context, id string) (organization.Position, error)
	ListPositions    func(ctx context.Context, facilityID string) ([]organization.Position, error)
	CreatePosition   func(ctx context.Context, facilityID, name string, policyIDs []string) (organization.Position, error)
	GetPolicy        func(ctx context.Context, id string) (organization.Policy, error)
	ListPolicies     func(ctx context.Context) ([]organization.Policy, error)
}
