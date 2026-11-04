package main

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
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

// visitMasterApp は、visit のマスタの操作の型を作り、VisitMasterApp に入れる。
func visitMasterApp(masters visit.MasterRepository) httpapi.VisitMasterApp {
	return httpapi.VisitMasterApp{
		ListServiceCodes: visit.NewListServiceCodes(masters).Do,
		ListCategories:   visit.NewListCategories(masters).Do,
	}
}

// patientApp は、patient の操作の型を作り、PatientApp に入れる。
func patientApp(
	facilities kernel.Finder[organization.Facility],
	staffRefs patient.StaffRefs,
	serviceCodes patient.ServiceCodes,
	patients patient.Repository,
	schedules patient.ScheduleReader,
	locks patient.FacilityLocker,
	tx tx.Transactor,
	ids kernel.IDGenerator,
	guard organization.Guard,
) httpapi.PatientApp {
	return httpapi.PatientApp{
		Create:             patient.NewCreate(facilities, serviceCodes, staffRefs, patients, tx, ids, guard).Do,
		Update:             patient.NewUpdate(serviceCodes, patients, staffRefs, tx, guard).Do,
		End:                patient.NewEnd(patients, locks, schedules, nil, tx, guard).Do,
		RemainingSchedules: patient.NewRemainingSchedules(patients, schedules, nil, guard).Do,
		Resume:             patient.NewResume(patients, locks, staffRefs, tx, guard).Do,
		Get:                patient.NewGet(patients, guard).Do,
		List:               patient.NewList(facilities, patients).Do,
	}
}
