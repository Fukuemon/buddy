package scheduleview

import (
	"cmp"
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// ProjectionDeps は、List が、google_primary の事業所の予定を Projection から読むのに使う依存である。
type ProjectionDeps struct {
	Projections Projections
	Syncs       CalendarSyncs
	// Cutovers は、open の切り替えを読む。nil なら、切り替えを読まない。
	Cutovers     Cutovers
	Rules        EventRules
	Patients     Patients
	ServiceCodes ServiceCodes
	Types        ScheduleTypes
	// Now は、日付の絞り込みを省いたときに使う、Projection を保持する期間を決める今の時刻である。nil なら time.Now を使う。
	Now func() time.Time
}

// List は、事業所の予定のうち、見てよい職員の予定を返す。
type List struct {
	facilities kernel.Finder[organization.Facility]
	schedules  Schedules
	recurring  RecurringSchedules
	staff      StaffRefs
	projected  ProjectionDeps
}

// NewList は List を作る。
func NewList(facilities kernel.Finder[organization.Facility], schedules Schedules, recurring RecurringSchedules, staff StaffRefs, projected ProjectionDeps) List {
	return List{facilities: facilities, schedules: schedules, recurring: recurring, staff: staff, projected: projected}
}

// Do は、事業所の予定のうち、見てよい職員の予定を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
// buddy_primary の事業所では buddy の予定のテーブルを、google_primary の事業所では Projection を読む（ADR-0033、ADR-0035）。
func (s List) Do(ctx context.Context, facilityID string, q ListQuery) (Listing, error) {
	if err := q.Validate(); err != nil {
		return Listing{}, err
	}
	p, err := schedule.Current(ctx)
	if err != nil {
		return Listing{}, err
	}
	f, err := s.facilities.Get(ctx, facilityID)
	if err != nil {
		return Listing{}, err
	}
	readable, err := s.readableStaff(ctx, p, facilityID)
	if err != nil {
		return Listing{}, err
	}
	if f.SourceMode == organization.SourceGooglePrimary {
		return s.listProjected(ctx, f, q, readable)
	}
	single, err := s.schedules.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return Listing{}, err
	}
	recurring, err := s.recurring.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return Listing{}, err
	}
	return Listing{
		Schedules:          filter(single, func(d Detail) bool { return readable(d.StaffID) }),
		RecurringSchedules: filter(recurring, func(d RecurringDetail) bool { return readable(d.StaffID) }),
		SourceMode:         f.SourceMode,
		CalendarSyncs:      []CalendarSync{},
	}, nil
}

// readableStaff は、事業所の職員のうち、p が予定を見てよい職員かを返す関数を返す。
func (s List) readableStaff(ctx context.Context, p principal.Principal, facilityID string) (func(staffID string) bool, error) {
	if schedule.CanReadAll(p) {
		return func(string) bool { return true }, nil
	}
	members, err := s.staff.ListByFacility(ctx, facilityID)
	if err != nil {
		return nil, err
	}
	return schedule.Readable(p, members), nil
}

// listProjected は、google_primary の事業所 f の Projection の予定のうち、見てよい職員の予定を、q の期間の単発の予定にして返す。
// カレンダーの職員を予定の職員とみなし、buddy の予定と同じ閲覧の判定（readable）を当てる。
func (s List) listProjected(ctx context.Context, f organization.Facility, q ListQuery, readable func(string) bool) (Listing, error) {
	now := time.Now
	if s.projected.Now != nil {
		now = s.projected.Now
	}
	from, to := projectionRange(q, now())
	rows, err := s.projected.Projections.ListByFacility(ctx, f.ID, dayBefore(from))
	if err != nil {
		return Listing{}, err
	}
	rows = filter(rows, func(r ProjectionDetail) bool { return r.FacilityID == f.ID && readable(r.StaffID) })
	events := expandProjections(rows, s.projected.Rules, from, to)
	b, err := s.newProjectionBuilder(ctx, f.ID, events)
	if err != nil {
		return Listing{}, err
	}
	details := make([]Detail, 0, len(events))
	for _, e := range events {
		d := b.detail(e)
		if q.TypeName == nil || *q.TypeName == d.TypeName {
			details = append(details, d)
		}
	}
	sortDetails(details, q.Sort)
	syncs, err := s.projected.Syncs.ListSyncsByFacility(ctx, f.ID)
	if err != nil {
		return Listing{}, err
	}
	var cutover *OpenCutover
	if s.projected.Cutovers != nil {
		if cutover, err = s.projected.Cutovers.FindOpenCutover(ctx, f.ID); err != nil {
			return Listing{}, err
		}
	}
	return Listing{
		Schedules:          details,
		RecurringSchedules: []RecurringDetail{},
		SourceMode:         f.SourceMode,
		CalendarSyncs:      filter(syncs, func(c CalendarSync) bool { return readable(c.StaffID) }),
		Cutover:            cutover,
	}, nil
}

// retainedMonthsBefore と retainedMonthsAfter は、Projection を保持する期間（前々月の初日から 3 か月後の月末）の、今月からの月の数である（ADR-0035）。
const (
	retainedMonthsBefore = 2
	retainedMonthsAfter  = 3
)

// projectionRange は、Projection を読む期間を返す。q の日付の絞り込みを省いた端は、今の時刻 now の、Projection を保持する期間の端にする。
func projectionRange(q ListQuery, now time.Time) (civil.Date, civil.Date) {
	today := civil.Today(now)
	from := civil.DateOf(time.Date(today.Year, today.Month-retainedMonthsBefore, 1, 0, 0, 0, 0, time.UTC))
	to := civil.DateOf(time.Date(today.Year, today.Month+retainedMonthsAfter+1, 0, 0, 0, 0, 0, time.UTC))
	if q.DateFrom != nil {
		from = *q.DateFrom
	}
	if q.DateTo != nil {
		to = *q.DateTo
	}
	return from, to
}

// projectionBuilder は、読み替えた Projection の予定を、予定の種類と訪問の情報の名前を引いて Detail にする。
type projectionBuilder struct {
	rules      EventRules
	normal     schedule.Type
	visit      schedule.Type
	serviceIDs map[string]servicecodeRef
	patients   map[string][]patient.Detail
}

type servicecodeRef struct{ id, code string }

func (s List) newProjectionBuilder(ctx context.Context, facilityID string, events []projectedEvent) (projectionBuilder, error) {
	b := projectionBuilder{rules: s.projected.Rules, serviceIDs: map[string]servicecodeRef{}, patients: map[string][]patient.Detail{}}
	types, err := s.projected.Types.List(ctx)
	if err != nil {
		return projectionBuilder{}, err
	}
	for _, t := range types {
		switch t.Code {
		case schedule.CodeNormal:
			b.normal = t
		case schedule.CodeVisit:
			b.visit = t
		}
	}
	if !slices.ContainsFunc(events, func(e projectedEvent) bool { return e.reading.Kind == EventVisit }) {
		return b, nil
	}
	codes, err := s.projected.ServiceCodes.List(ctx)
	if err != nil {
		return projectionBuilder{}, err
	}
	for _, c := range codes {
		b.serviceIDs[b.rules.ServiceKey(c.Code)] = servicecodeRef{id: c.ID, code: c.Code}
	}
	pats, err := s.projected.Patients.ListByFacility(ctx, facilityID, patient.ListQuery{Sort: kernel.Sort{Field: "name"}})
	if err != nil {
		return projectionBuilder{}, err
	}
	for _, p := range pats {
		key := b.rules.ClientKey(p.Name)
		b.patients[key] = append(b.patients[key], p)
	}
	return b, nil
}

// detail は、e を Detail にする。訪問の予定は、タイトルのサービス内容と利用者名でサービスコードと利用者を引き、
// 引けないときは訪問の情報を付けず、Google のタイトルの通常の予定にして理由を付ける。
func (b projectionBuilder) detail(e projectedEvent) Detail {
	rd := e.reading
	id := projectedID(e)
	at := e.row.ProjectedAt
	if e.row.GoogleUpdatedAt != nil {
		at = *e.row.GoogleUpdatedAt
	}
	d := Detail{
		Schedule: schedule.Schedule{ID: id, Slot: schedule.Slot{
			FacilityID: e.row.FacilityID, StaffID: e.row.StaffID, TypeID: b.normal.ID,
			Date: rd.Date, StartTime: rd.StartTime, EndTime: rd.EndTime, EndsNextDay: rd.EndsNextDay,
			IsOverTimeWork: schedule.IsOverTimeWork(rd.StartTime),
		}},
		TypeName: b.normal.Name, StaffName: e.row.StaffName, Version: 1, CreatedAt: at, UpdatedAt: at,
		Source: SourceGoogleCalendar,
	}
	if strings.TrimSpace(rd.Title) != "" {
		title := rd.Title
		d.Title = &title
	}
	switch {
	case e.unsupported:
		d.ReviewReason = ReviewRecurrenceUnsupported
	case rd.Kind == EventUnreadableTitle:
		d.ReviewReason = ReviewTitleUnreadable
	case rd.Kind == EventVisit:
		code, ok := b.serviceIDs[rd.ServiceKey]
		matches := b.patients[rd.ClientKey]
		switch {
		case !ok:
			d.ReviewReason = ReviewServiceCodeNotFound
		case len(matches) == 0:
			d.ReviewReason = ReviewPatientNotFound
		case len(matches) > 1:
			d.ReviewReason = ReviewPatientAmbiguous
		default:
			d.TypeID, d.TypeName, d.Title = b.visit.ID, b.visit.Name, nil
			d.VisitInfoID = &id
			d.Visit = &visit.Detail{
				ID: id, PatientID: matches[0].ID, PatientName: matches[0].Name,
				AssignedStaffID: e.row.StaffID, AssignedStaffName: e.row.StaffName,
				ServiceCodeID: code.id, ServiceCode: code.code, Categories: []visit.Category{},
			}
		}
	}
	return d
}

// sortDetails は、Projection の予定を、buddy の予定の一覧と同じく sort の順に並べる。date は日付の後に開始の時刻で並べる。
// 同じ値の予定は ID の順にし、読むたびに同じ順にする。
func sortDetails(ds []Detail, sort kernel.Sort) {
	slices.SortFunc(ds, func(a, b Detail) int {
		var c int
		switch sort.Field {
		case "start_time":
			c = cmp.Compare(a.StartTime.Minutes(), b.StartTime.Minutes())
		case "created_at":
			c = a.CreatedAt.Compare(b.CreatedAt)
		default:
			c = cmp.Or(a.Date.Time().Compare(b.Date.Time()), cmp.Compare(a.StartTime.Minutes(), b.StartTime.Minutes()))
		}
		if sort.Descending {
			c = -c
		}
		return cmp.Or(c, strings.Compare(a.ID, b.ID))
	})
}

func filter[T any](items []T, keep func(T) bool) []T {
	out := make([]T, 0, len(items))
	for _, it := range items {
		if keep(it) {
			out = append(out, it)
		}
	}
	return out
}
