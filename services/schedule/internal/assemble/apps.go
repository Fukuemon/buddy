package assemble

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/schedule/internal/access"
	"github.com/Fukuemon/buddy/services/schedule/internal/broker"
	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// HandlerConfig は、NewHandler がリポジトリのほかに受ける値である。
type HandlerConfig struct {
	// API は予定の API の設定で、NewHandler は AllowOrigins、Broker、Calendar の ExportEnabled を使う。
	// ExportEnabled が false なら、予定の変更を書き出しの待ちに積まない。
	API config.API
	// Accounts は NewCalendarAccounts の戻り値である。nil なら、外部のカレンダーを読む操作は ErrNotConfigured を返す。
	Accounts *gcal.Accounts
	// Verifier は、リクエストの access token を検証する。
	Verifier *oidc.Verifier
	Logger   *slog.Logger
	// Ready は GET /readyz が依存先を確認する関数で、nil なら常にリクエストを受けられるとみなす。
	Ready func(ctx context.Context) error
}

// NewHandler は、r と cfg から全ての機能の操作の型を作り、予定の API の全てのパスを受ける http.Handler を返す。
func NewHandler(r Repositories, cfg HandlerConfig) http.Handler {
	return httpapi.NewRouter(newApps(r, cfg.Accounts, cfg.API), httpapi.RouterConfig{
		Logger: cfg.Logger, AllowOrigins: cfg.API.AllowOrigins, Verifier: tokenVerifier{cfg.Verifier}, Ready: cfg.Ready,
	})
}

func newApps(r Repositories, accounts *gcal.Accounts, cfg config.API) httpapi.Apps {
	var outbox schedule.Exports
	if cfg.Calendar.ExportEnabled {
		outbox = calendarexport.NewOutbox(r.facilities, r.exports, r.calendars, r.ids)
	}
	visitInfos := r.visitWriter()
	return httpapi.Apps{
		Organization: organizationApp(r.facilities, r.departments, r.teams, r.positions, r.policies, r.tx, r.ids, principal.RequireStaffManage),
		Staff: staffApp(r.facilities, r.departments, r.teams, r.positions, r.policies, r.staff, r.facilities,
			broker.New(broker.Config(cfg.Broker), nil), r.staffAssignments, r.calendars,
			func(ctx context.Context) (string, bool) {
				p, ok := principal.From(ctx)
				return p.Staff.ID, ok
			},
			r.tx, r.ids, principal.RequireStaffManage),
		Patients:        patientApp(r.facilities, r.staffRefs, r.serviceCodes, r.patients, r.patientSchedules, r.facilities, r.tx, r.ids, principal.RequireStaffManage),
		ServiceCodes:    httpapi.ServiceCodeApp{List: servicecode.NewList(r.serviceCodes).Do},
		VisitCategories: httpapi.VisitCategoryApp{List: visit.NewListCategories(r.visitCategories).Do},
		Schedules:       scheduleApp(r.facilities, r.staffRefs, r.facilities, visitInfos, r.schedules, r.recurring, r.scheduleTypes, outbox, r.tx, r.ids),
		Calendars: calendarApp(r.calendars, calendarAccounts(accounts), r.staffRefs, r.facilities, r.patients, r.serviceCodes, r.scheduleTypes,
			r.schedules, r.recurring, r.recurring, visitInfos, r.exports, r.tx, r.ids, principal.RequireStaffManage),
		Auth: access.NewService(access.Deps{
			Facilities: r.facilities, Departments: r.departments, Teams: r.teams, Positions: r.positions,
			Staff: r.staff, StaffRefs: r.staffRefs, Patients: r.patients, Schedules: r.schedules, Recurring: r.recurring, Calendars: r.calendars,
			Exports: r.exports,
		}),
	}
}

// calendarAccounts は、設定が無いときに、nil の *gcal.Accounts を入れた calendar.Accounts でなく nil を返す。
func calendarAccounts(a *gcal.Accounts) calendar.Accounts {
	if a == nil {
		return nil
	}
	return a
}

// tokenVerifier は、共有の oidc.Verifier を httpapi.TokenVerifier にする。httpapi は oidc を import しないので、主張の型をここで写す。
type tokenVerifier struct{ v *oidc.Verifier }

// Verify は、トークンを検証し、主張を principal.Identity にして返す。
func (t tokenVerifier) Verify(ctx context.Context, raw string) (principal.Identity, error) {
	id, err := t.v.Verify(ctx, raw)
	return principal.Identity{Subject: id.Subject, OrgID: id.OrgID}, err
}

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

// patientApp は、patient の操作の型を作り、PatientApp に入れる。
func patientApp(
	facilities kernel.Finder[organization.Facility],
	staffRefs patient.StaffRefs,
	serviceCodes patient.ServiceCodes,
	patients patient.Repository,
	schedules patient.ScheduleReader,
	locks patient.FacilityLock,
	tx tx.Transactor,
	ids kernel.IDGenerator,
	guard organization.Guard,
) httpapi.PatientApp {
	return httpapi.PatientApp{
		Create:             patient.NewCreate(facilities, serviceCodes, staffRefs, locks, patients, tx, ids, guard).Do,
		Update:             patient.NewUpdate(serviceCodes, patients, staffRefs, locks, tx, guard).Do,
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
	locks staff.FacilityLock,
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
		ChangePosition:       staff.NewChangePosition(staffRepo, locks, positions, tx, ids, guard).Do,
		UpdateProfile:        staff.NewUpdateProfile(staffRepo, locks, departments, teams, assignments, nil, tx, guard).Do,
		AddGrant:             staff.NewAddGrant(staffRepo, policies, teams, tx, ids, guard).Do,
		RemoveGrant:          staff.NewRemoveGrant(staffRepo, locks, tx, guard).Do,
		Leave:                staff.NewLeave(self, staffRepo, locks, assignments, nil, identities, tx, guard).Do,
		Reinstate:            staff.NewReinstate(staffRepo, locks, identities, tx, guard).Do,
		Retire:               staff.NewRetire(self, staffRepo, locks, assignments, nil, identities, calendars, tx, guard).Do,
		RemainingAssignments: staff.NewRemainingAssignments(staffRepo, assignments, nil, guard).Do,
	}
}

// scheduleApp は、schedule と scheduleview の操作の型を作り、ScheduleApp に入れる。exports が nil なら、予定の変更を書き出しの待ちに積まない。
func scheduleApp(
	facilities kernel.Finder[organization.Facility],
	staffRefs schedule.StaffRefs,
	locks schedule.FacilityLock,
	visits schedule.VisitInfos,
	schedules interface {
		schedule.Repository
		scheduleview.Schedules
	},
	recurring interface {
		schedule.RecurringRepository
		scheduleview.RecurringSchedules
	},
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
		Create:           schedule.NewCreate(facilities, schedules, types, staffRefs, locks, visits, nil, exports, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(facilities, types, staffRefs, locks, visits, nil, recurring, exports, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(recurring, staffRefs, locks, schedules, types, visits, nil, exports, tx, ids).Do,
		Cancel:           schedule.NewCancel(schedules, staffRefs, locks, exports, tx, ids).Do,
		Update:           schedule.NewUpdate(schedules, staffRefs, locks, types, visits, nil, exports, tx).Do,
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
	locks interface {
		calendar.FacilityLock
		calendarimport.FacilityLock
		calendarsync.FacilityLock
	},
	patients calendar.Patients,
	serviceCodes calendar.ServiceCodes,
	types calendar.Types,
	schedules calendar.ScheduleStore,
	recurring calendarimport.Recurring,
	recurringSchedules kernel.Finder[scheduleview.RecurringDetail],
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
		Link:             calendar.NewLink(accounts, staffRefs, locks, calendars, tx, ids, guard).Do,
		Unlink:           calendar.NewUnlink(calendars, guard).Do,
		Preview:          calendarimport.NewPreview(calendars, accounts, staffRefs, patients, recurringSchedules, serviceCodes, guard).Do,
		Import:           calendarimport.NewImport(calendars, accounts, staffRefs, locks, patients, recurringSchedules, serviceCodes, types, recurring, schedules, visits, tx, ids, guard).Do,
		ListExportIssues: calendarexport.NewListExportIssues(exports, guard).Do,
		RetryExport:      calendarexport.NewRetryExport(exports, guard).Do,
		AcceptExport:     calendarsync.NewAcceptExport(exports, schedules, calendars, accounts, staffRefs, locks, types, patients, serviceCodes, visits, tx, ids, guard).Do,
	}
}
