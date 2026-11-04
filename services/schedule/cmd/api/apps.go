package main

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// organizationApp は、organization の操作の型を作り、OrganizationApp に入れる。
func organizationApp(
	facilities organization.FacilityRepository,
	departments organization.DepartmentRepository,
	teams organization.TeamRepository,
	positions organization.PositionRepository,
	policies organization.PolicyRepository,
	tx tx.Transactor,
	ids kernel.IDGenerator,
	guard organization.Guard,
) httpapi.OrganizationApp {
	return httpapi.OrganizationApp{
		GetFacility:      organization.NewGetFacility(facilities).Do,
		GetDepartment:    organization.NewGetDepartment(departments).Do,
		ListDepartments:  organization.NewListDepartments(facilities, departments).Do,
		CreateDepartment: organization.NewCreateDepartment(facilities, departments, ids, guard).Do,
		UpdateDepartment: organization.NewUpdateDepartment(departments, guard).Do,
		GetTeam:          organization.NewGetTeam(teams).Do,
		ListTeams:        organization.NewListTeams(facilities, teams).Do,
		CreateTeam:       organization.NewCreateTeam(facilities, teams, ids, guard).Do,
		UpdateTeam:       organization.NewUpdateTeam(teams, guard).Do,
		GetPosition:      organization.NewGetPosition(positions).Do,
		ListPositions:    organization.NewListPositions(facilities, positions).Do,
		CreatePosition:   organization.NewCreatePosition(facilities, policies, positions, tx, ids, guard).Do,
		GetPolicy:        organization.NewGetPolicy(policies).Do,
		ListPolicies:     organization.NewListPolicies(policies).Do,
	}
}
