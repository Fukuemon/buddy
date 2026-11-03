package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// OrganizationApp は、事業所、部署、チーム、役職、権限のハンドラが使う操作である。
type OrganizationApp interface {
	GetFacility(ctx context.Context, id string) (organization.Facility, error)
	GetDepartment(ctx context.Context, id string) (organization.Department, error)
	ListDepartments(ctx context.Context, facilityID string) ([]organization.Department, error)
	CreateDepartment(ctx context.Context, facilityID, name string) (organization.Department, error)
	UpdateDepartment(ctx context.Context, id, name string) (organization.Department, error)
	GetTeam(ctx context.Context, id string) (organization.Team, error)
	ListTeams(ctx context.Context, facilityID string) ([]organization.Team, error)
	CreateTeam(ctx context.Context, facilityID, name string, color organization.TeamColor) (organization.Team, error)
	UpdateTeam(ctx context.Context, id, name string, color organization.TeamColor) (organization.Team, error)
	GetPosition(ctx context.Context, id string) (organization.Position, error)
	ListPositions(ctx context.Context, facilityID string) ([]organization.Position, error)
	CreatePosition(ctx context.Context, facilityID, name string, policyIDs []string) (organization.Position, error)
	GetPolicy(ctx context.Context, id string) (organization.Policy, error)
	ListPolicies(ctx context.Context) ([]organization.Policy, error)
}
