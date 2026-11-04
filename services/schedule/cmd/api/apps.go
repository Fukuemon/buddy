package main

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
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

// staffApp は、staff の操作の型を作り、StaffApp に入れる。self は、ctx のリクエストを送った職員の ID を返す。
func staffApp(
	facilities kernel.Finder[organization.Facility],
	departments kernel.Finder[organization.Department],
	teams kernel.Finder[organization.Team],
	positions kernel.Finder[organization.Position],
	policies kernel.Finder[organization.Policy],
	staffRepo staff.Repository,
	identities staff.Identities,
	assignments staff.AssignmentReader,
	calendars staff.CalendarDetacher,
	self func(ctx context.Context) (string, bool),
	tx tx.Transactor,
	ids kernel.IDGenerator,
	guard organization.Guard,
) httpapi.StaffApp {
	return httpapi.StaffApp{
		Create:               staff.NewCreate(facilities, departments, teams, positions, identities, staffRepo, tx, ids, guard).Do,
		Get:                  staff.NewGet(staffRepo).Do,
		List:                 staff.NewList(facilities, staffRepo).Do,
		ChangePosition:       staff.NewChangePosition(staffRepo, positions, tx, ids, guard).Do,
		UpdateProfile:        staff.NewUpdateProfile(staffRepo, departments, teams, assignments, nil, tx, guard).Do,
		AddGrant:             staff.NewAddGrant(staffRepo, policies, teams, tx, ids, guard).Do,
		RemoveGrant:          staff.NewRemoveGrant(staffRepo, tx, guard).Do,
		Leave:                staff.NewLeave(self, staffRepo, assignments, nil, identities, tx, guard).Do,
		Reinstate:            staff.NewReinstate(staffRepo, identities, tx, guard).Do,
		Retire:               staff.NewRetire(self, staffRepo, assignments, nil, identities, calendars, tx, guard).Do,
		RemainingAssignments: staff.NewRemainingAssignments(staffRepo, assignments, nil, guard).Do,
	}
}

// scheduleApp は、schedule と scheduleview の操作の型を作り、ScheduleApp に入れる。exports が nil なら、予定の変更を書き出しの待ちに積まない。
func scheduleApp(
	facilities kernel.Finder[organization.Facility],
	staffRefs schedule.StaffRefs,
	visits schedule.VisitInfos,
	schedules schedule.Repository,
	recurring schedule.RecurringRepository,
	types schedule.TypeRepository,
	exports schedule.Exports,
	tx tx.Transactor,
	ids kernel.IDGenerator,
) httpapi.ScheduleApp {
	return httpapi.ScheduleApp{
		ListTypes:        schedule.NewListTypes(types).Do,
		Get:              scheduleview.NewGet(schedules, staffRefs).Do,
		GetRecurring:     scheduleview.NewGetRecurring(recurring, staffRefs).Do,
		List:             scheduleview.NewList(facilities, schedules, recurring, staffRefs).Do,
		Create:           schedule.NewCreate(facilities, schedules, types, staffRefs, visits, nil, exports, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(facilities, types, staffRefs, visits, nil, recurring, exports, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(recurring, staffRefs, schedules, types, visits, nil, exports, tx, ids).Do,
		Cancel:           schedule.NewCancel(schedules, staffRefs, exports, tx, ids).Do,
		Update:           schedule.NewUpdate(schedules, staffRefs, types, visits, nil, exports, tx).Do,
	}
}

// calendarApp は、calendar、calendarimport、calendarsync、calendarexport の操作の型を作り、CalendarApp に入れる。accounts が nil なら、外部のカレンダーを読む操作は ErrNotConfigured を返す。
func calendarApp(
	calendars interface {
		calendar.Repository
		calendarimport.Calendars
		calendarsync.Calendars
	},
	accounts calendar.Accounts,
	staffRefs calendar.StaffRefs,
	patients calendar.Patients,
	serviceCodes calendar.ServiceCodes,
	types calendar.Types,
	schedules calendar.ScheduleStore,
	recurring calendarimport.Recurring,
	recurringSchedules kernel.Finder[schedule.RecurringDetail],
	visits calendar.VisitStore,
	exports interface {
		calendarsync.ExportRepository
		calendarexport.ExportRepository
	},
	tx tx.Transactor,
	ids kernel.IDGenerator,
	guard organization.Guard,
) httpapi.CalendarApp {
	return httpapi.CalendarApp{
		ServiceAccount:   calendar.NewServiceAccount(accounts, guard).Do,
		List:             calendar.NewList(calendars, guard).Do,
		Check:            calendar.NewCheck(accounts, guard).Do,
		Link:             calendar.NewLink(accounts, staffRefs, calendars, tx, ids, guard).Do,
		Unlink:           calendar.NewUnlink(calendars, guard).Do,
		Preview:          calendarimport.NewPreview(calendars, accounts, staffRefs, patients, recurringSchedules, serviceCodes, guard).Do,
		Import:           calendarimport.NewImport(calendars, accounts, staffRefs, patients, recurringSchedules, serviceCodes, types, recurring, schedules, visits, tx, ids, guard).Do,
		ListExportIssues: calendarexport.NewListExportIssues(exports, guard).Do,
		RetryExport:      calendarexport.NewRetryExport(exports, guard).Do,
		AcceptExport:     calendarsync.NewAcceptExport(exports, schedules, calendars, accounts, staffRefs, types, patients, serviceCodes, visits, tx, ids, guard).Do,
	}
}
