package main

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/schedule/internal/access"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/broker"
	"github.com/Fukuemon/buddy/services/schedule/internal/config"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
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
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// repositories は、1 つの接続のプールの上のリポジトリ、トランザクション、ID の発行である。
// newRepositories で作り、openAccounts と newHandler に同じ値を渡す。
type repositories struct {
	tx               *postgres.Transactor
	ids              ulid.Generator
	facilities       *postgres.FacilityRepository
	departments      *postgres.DepartmentRepository
	teams            *postgres.TeamRepository
	positions        *postgres.PositionRepository
	policies         *postgres.PolicyRepository
	staff            *postgres.StaffRepository
	staffRefs        *postgres.StaffRefRepository
	staffAssignments *postgres.StaffAssignmentReader
	patients         *postgres.PatientRepository
	patientSchedules *postgres.PatientScheduleReader
	visitInfos       *postgres.VisitInfoRepository
	serviceCodes     *postgres.ServiceCodeRepository
	visitCategories  *postgres.VisitCategoryRepository
	schedules        *postgres.ScheduleRepository
	recurring        *postgres.RecurringScheduleRepository
	scheduleTypes    *postgres.ScheduleTypeRepository
	calendars        *postgres.CalendarRepository
	exports          *postgres.CalendarExportRepository
	projections      *postgres.CalendarProjectionRepository
	cutovers         *postgres.CalendarCutoverRepository
	records          *postgres.CalendarEventRecordRepository
	permissionAudits *postgres.PermissionAuditRepository
}

// newRepositories は、db の上に repositories を作る。db に接続せず、失敗しない。
func newRepositories(db *pgxpool.Pool) repositories {
	return repositories{
		tx:               postgres.NewTransactor(db),
		ids:              ulid.Generator{},
		facilities:       postgres.NewFacilityRepository(db),
		departments:      postgres.NewDepartmentRepository(db),
		teams:            postgres.NewTeamRepository(db),
		positions:        postgres.NewPositionRepository(db),
		policies:         postgres.NewPolicyRepository(db),
		staff:            postgres.NewStaffRepository(db),
		staffRefs:        postgres.NewStaffRefRepository(db),
		staffAssignments: postgres.NewStaffAssignmentReader(db),
		patients:         postgres.NewPatientRepository(db),
		patientSchedules: postgres.NewPatientScheduleReader(db),
		visitInfos:       postgres.NewVisitInfoRepository(db),
		serviceCodes:     postgres.NewServiceCodeRepository(db),
		visitCategories:  postgres.NewVisitCategoryRepository(db),
		schedules:        postgres.NewScheduleRepository(db),
		recurring:        postgres.NewRecurringScheduleRepository(db),
		scheduleTypes:    postgres.NewScheduleTypeRepository(db),
		calendars:        postgres.NewCalendarRepository(db),
		exports:          postgres.NewCalendarExportRepository(db),
		projections:      postgres.NewCalendarProjectionRepository(db),
		cutovers:         postgres.NewCalendarCutoverRepository(db),
		records:          postgres.NewCalendarEventRecordRepository(db),
		permissionAudits: postgres.NewPermissionAuditRepository(db),
	}
}

// openAccounts は、事業所の組織のサービスアカウントで Google カレンダーを読み書きする gcal.Accounts を返す。
// 書き出しを有効にした設定なら、スコープを calendar.events にする。サービスアカウントの設定が無ければ nil を返す。
func openAccounts(ctx context.Context, cfg config.Calendar, r repositories) (*gcal.Accounts, error) {
	return gcal.Open(ctx, gcal.Config{ServiceAccountsFile: cfg.ServiceAccountsFile, Endpoint: cfg.Endpoint, Writable: cfg.ExportEnabled},
		func(ctx context.Context, facilityID string) (string, error) {
			f, err := r.facilities.Get(ctx, facilityID)
			return f.OrgID, err
		})
}

func (r repositories) visitWriter() visit.Writer {
	return visit.NewWriter(visit.WriterDeps{
		Staff:        r.staffRefs,
		Patients:     r.patients,
		Infos:        r.visitInfos,
		ServiceCodes: r.serviceCodes,
		Categories:   r.visitCategories,
	}, r.ids)
}

// handlerConfig は、newHandler がリポジトリのほかに受ける値である。
type handlerConfig struct {
	// API は予定の API の設定で、newHandler は AllowOrigins、Broker、Calendar の ExportEnabled を使う。
	// ExportEnabled が false なら、予定の変更を書き出しの待ちに積まない。
	API config.API
	// Accounts は openAccounts の戻り値である。nil なら、外部のカレンダーを読む操作は ErrNotConfigured を返す。
	Accounts *gcal.Accounts
	// Verifier は、リクエストの access token を検証する。
	Verifier *oidc.Verifier
	Logger   *slog.Logger
	// Ready は GET /readyz が依存先を確認する関数で、nil なら常にリクエストを受けられるとみなす。
	Ready func(ctx context.Context) error
}

// newHandler は、r と cfg から全ての機能の操作の型を作り、予定の API の全てのパスを受ける http.Handler を返す。
func newHandler(r repositories, cfg handlerConfig) http.Handler {
	return httpapi.NewRouter(newApps(r, cfg.Accounts, cfg.API, cfg.Logger), httpapi.RouterConfig{
		Logger: cfg.Logger, AllowOrigins: cfg.API.AllowOrigins, Verifier: tokenVerifier{cfg.Verifier}, Ready: cfg.Ready,
	})
}

func newApps(r repositories, accounts *gcal.Accounts, cfg config.API, log *slog.Logger) httpapi.Apps {
	var outbox schedule.Exports
	if cfg.Calendar.ExportEnabled {
		outbox = calendarexport.NewOutbox(r.facilities, r.exports, r.calendars, r.ids)
	}
	visitInfos := r.visitWriter()
	self := func(ctx context.Context) (string, bool) {
		p, ok := principal.From(ctx)
		return p.Staff.ID, ok
	}
	rec := audit.NewRecorder(r.permissionAudits, r.ids, self)
	return httpapi.Apps{
		Organization: organizationApp(r.facilities, r.departments, r.teams, r.positions, r.policies, rec, r.tx, r.ids, principal.RequireStaffManage),
		Staff: staffApp(r.facilities, r.departments, r.teams, r.positions, r.policies, r.staff, r.facilities,
			broker.New(broker.Config(cfg.Broker), nil), r.staffAssignments, r.calendars, self, rec,
			r.tx, r.ids, principal.RequireStaffManage),
		Patients:        patientApp(r.facilities, r.staffRefs, r.serviceCodes, r.patients, r.patientSchedules, r.facilities, r.tx, r.ids, principal.RequireStaffManage),
		ServiceCodes:    httpapi.ServiceCodeApp{List: servicecode.NewList(r.serviceCodes).Do},
		VisitCategories: httpapi.VisitCategoryApp{List: visit.NewListCategories(r.visitCategories).Do},
		Schedules: scheduleApp(r.facilities, r.staffRefs, r.facilities, visitInfos, r.schedules, r.recurring, r.scheduleTypes,
			scheduleview.ProjectionDeps{
				Projections: r.projections, Syncs: r.projections, Cutovers: r.projections, Rules: calendar.ProjectionRules{},
				Patients: r.patients, ServiceCodes: r.serviceCodes, Types: r.scheduleTypes,
			},
			outbox, r.tx, r.ids),
		Calendars: calendarApp(r.calendars, calendarAccounts(accounts), r.staffRefs, r.facilities, r.patients, r.serviceCodes, r.scheduleTypes,
			r.schedules, r.recurring, r.recurring, visitInfos, r.exports,
			cutoverDeps{cutovers: r.cutovers, syncs: r.projections, projections: r.projections, facilities: r.facilities},
			r.tx, r.ids, principal.RequireStaffManage),
		CalendarWrites: httpapi.CalendarWriteApp{
			Create: calendarwrite.NewCreate(r.facilities, r.projections, r.scheduleTypes, r.staffRefs, r.staff, visitInfos, r.visitInfos,
				r.calendars, r.records, r.projections, calendarAccounts(accounts), nil, r.tx).Do,
			Update: calendarwrite.NewUpdate(r.facilities, r.projections, r.scheduleTypes, r.staffRefs, r.staff, visitInfos, r.visitInfos,
				r.calendars, r.records, r.projections, calendarAccounts(accounts), r.ids, log, nil, r.tx).Do,
			Cancel: calendarwrite.NewCancel(r.facilities, r.projections, r.staffRefs, visitInfos, r.calendars, r.records, r.projections,
				calendarAccounts(accounts), nil, r.tx).Do,
			CreateRecurring: calendarwrite.NewCreateRecurring(r.facilities, r.projections, r.scheduleTypes, r.staffRefs, r.staff, visitInfos, r.visitInfos,
				r.calendars, r.records, r.projections, calendarAccounts(accounts), nil, r.tx).Do,
			ChangeOccurrence: calendarwrite.NewChangeOccurrence(r.facilities, r.projections, r.scheduleTypes, r.staffRefs, r.staff, visitInfos, r.visitInfos,
				r.calendars, r.records, r.projections, calendarAccounts(accounts), r.ids, log, nil, r.tx).Do,
			ChangeRule: calendarwrite.NewChangeRule(r.facilities, r.projections, r.scheduleTypes, r.staffRefs, r.staff, visitInfos, r.visitInfos,
				r.calendars, r.records, r.projections, calendarAccounts(accounts), r.ids, log, nil, r.tx).Do,
		},
		Auth: access.NewService(access.Deps{Facilities: r.facilities, Staff: r.staff, Resources: accessResources(r)}),
	}
}

// accessResources は、access.ResourceFacility を除くリソースの種類ごとに、事業所の ID を読むリポジトリを返す。
func accessResources(r repositories) map[access.Resource]access.FacilityReader {
	return map[access.Resource]access.FacilityReader{
		access.ResourceDepartment: r.departments, access.ResourceTeam: r.teams, access.ResourcePosition: r.positions,
		access.ResourceStaff: r.staffRefs, access.ResourcePatient: r.patients,
		access.ResourceSchedule: r.schedules, access.ResourceRecurringSchedule: r.recurring,
		access.ResourceExternalCalendar: r.calendars, access.ResourceCalendarExport: r.exports, access.ResourceCalendarCutover: r.cutovers,
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
	rec audit.Recorder,
	tx tx.Transactor,
	ids kernel.IDGenerator,
	guard kernel.Guard,
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
		CreatePosition:   organization.NewCreatePosition(facilities, policies, positions, rec, tx, ids, guard).Do,
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
	guard kernel.Guard,
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
	rec audit.Recorder,
	tx tx.Transactor,
	ids kernel.IDGenerator,
	guard kernel.Guard,
) httpapi.StaffApp {
	return httpapi.StaffApp{
		Create:               staff.NewCreate(facilities, departments, teams, positions, identities, staffRepo, rec, tx, ids, guard).Do,
		Get:                  staff.NewGet(staffRepo).Do,
		List:                 staff.NewList(facilities, staffRepo).Do,
		ChangePosition:       staff.NewChangePosition(staffRepo, locks, positions, rec, tx, ids, guard).Do,
		UpdateProfile:        staff.NewUpdateProfile(staffRepo, locks, departments, teams, assignments, nil, rec, tx, guard).Do,
		AddGrant:             staff.NewAddGrant(staffRepo, locks, policies, teams, rec, tx, ids, guard).Do,
		RemoveGrant:          staff.NewRemoveGrant(staffRepo, locks, rec, tx, guard).Do,
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
	visits interface {
		schedule.VisitInfos
		schedule.VisitCopier
	},
	schedules interface {
		schedule.Repository
		scheduleview.Schedules
	},
	recurring interface {
		schedule.RecurringRepository
		scheduleview.RecurringSchedules
	},
	types schedule.TypeRepository,
	projected scheduleview.ProjectionDeps,
	exports schedule.Exports,
	tx tx.Transactor,
	ids kernel.IDGenerator,
) httpapi.ScheduleApp {
	return httpapi.ScheduleApp{
		ListTypes:        schedule.NewListTypes(types).Do,
		Get:              scheduleview.NewGet(schedules, staffRefs).Do,
		GetProjected:     scheduleview.NewGetProjected(projected, staffRefs).Do,
		GetRecurring:     scheduleview.NewGetRecurring(recurring, staffRefs).Do,
		List:             scheduleview.NewList(facilities, schedules, recurring, staffRefs, projected).Do,
		Create:           schedule.NewCreate(facilities, schedules, types, staffRefs, locks, visits, nil, exports, tx, ids).Do,
		CreateRecurring:  schedule.NewCreateRecurring(facilities, types, staffRefs, locks, visits, nil, recurring, exports, tx, ids).Do,
		ChangeOccurrence: schedule.NewChangeOccurrence(recurring, staffRefs, locks, schedules, types, visits, nil, exports, tx, ids).Do,
		ChangeRule:       schedule.NewChangeRule(recurring, staffRefs, locks, types, visits, nil, exports, tx, ids).Do,
		Cancel:           schedule.NewCancel(schedules, staffRefs, locks, exports, tx, ids).Do,
		CancelOccurrence: schedule.NewCancelOccurrence(recurring, staffRefs, locks, schedules, types, visits, exports, tx, ids).Do,
		Update:           schedule.NewUpdate(schedules, staffRefs, locks, types, visits, nil, exports, tx).Do,
		Delete:           schedule.NewDelete(schedules, staffRefs, locks, nil, exports, tx, ids).Do,
		DeleteOccurrence: schedule.NewDeleteOccurrence(recurring, staffRefs, locks, nil, exports, tx, ids).Do,
	}
}

// calendarApp は、calendar、calendarimport、calendarexport の操作の型を作り、CalendarApp に入れる。accounts が nil なら、外部のカレンダーを読む操作は ErrNotConfigured を返す。
func calendarApp(
	calendars interface {
		calendar.Repository
		calendarimport.Calendars
	},
	accounts calendar.Accounts,
	staffRefs calendar.StaffRefs,
	locks interface {
		calendar.FacilityLock
		calendarimport.FacilityLock
	},
	patients calendar.Patients,
	serviceCodes calendar.ServiceCodes,
	types calendar.Types,
	schedules calendar.ScheduleStore,
	recurring calendarimport.Recurring,
	recurringSchedules kernel.Finder[scheduleview.RecurringDetail],
	visits calendar.VisitStore,
	exports calendarexport.ExportRepository,
	cut cutoverDeps,
	tx tx.Transactor,
	ids kernel.IDGenerator,
	guard kernel.Guard,
) httpapi.CalendarApp {
	return httpapi.CalendarApp{
		ServiceAccount: calendar.NewServiceAccount(accounts, guard).Do,
		List:           calendar.NewList(calendars, guard).Do,
		Mine:           calendar.NewMine(calendars).Do,
		Check:          calendar.NewCheck(accounts, guard).Do,
		Link:           calendar.NewLink(accounts, staffRefs, locks, calendars, tx, ids, guard).Do,
		Unlink:         calendar.NewUnlink(calendars, guard).Do,
		Preview:        calendarimport.NewPreview(calendars, accounts, staffRefs, patients, recurringSchedules, serviceCodes, cut.cutovers, guard).Do,
		Import:         calendarimport.NewImport(calendars, accounts, staffRefs, locks, patients, recurringSchedules, serviceCodes, types, recurring, schedules, visits, cut.cutovers, tx, ids, guard).Do,
		GetCutover:     calendarimport.NewGetCutover(cut.syncs, cut.cutovers, guard).Do,
		StartCutover:   calendarimport.NewStartCutover(cut.facilities, cut.syncs, cut.cutovers, tx, ids, nil, guard).Do,
		CompleteCutover: calendarimport.NewCompleteCutover(calendars, accounts, staffRefs, patients, recurringSchedules, serviceCodes,
			cut.facilities, cut.syncs, cut.cutovers, cut.projections, tx, guard).Do,
		CancelCutover:    calendarimport.NewCancelCutover(cut.facilities, cut.cutovers, tx, guard).Do,
		ListExportIssues: calendarexport.NewListExportIssues(exports, guard).Do,
		RetryExport:      calendarexport.NewRetryExport(exports, guard).Do,
	}
}

// cutoverDeps は、calendarimport の切り替えの操作が使う依存である。
type cutoverDeps struct {
	cutovers    calendarimport.CutoverRepository
	syncs       scheduleview.CalendarSyncs
	projections calendarimport.Projections
	facilities  calendarimport.FacilityModes
}
