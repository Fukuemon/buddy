package calendar

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/kernel"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/tx"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

// maxCalendarIDLen は、外部のカレンダーの ID の長さの上限である。表の列の長さと同じにする。
const maxCalendarIDLen = 1024

// 衝突の原因の code。httpapi が 409 の応答の code にする。
const (
	// CodeCalendarTaken は、カレンダーがほかの職員に結び付いていることを表す。外したカレンダーを含む。
	CodeCalendarTaken = "calendar_taken"
	// CodeCalendarLinked は、カレンダーがその職員にすでに結び付いていることを表す。
	CodeCalendarLinked = "calendar_already_linked"
	// CodeStaffHasCalendar は、職員にほかのカレンダーが結び付いていることを表す。
	CodeStaffHasCalendar = "staff_has_calendar"
	// CodeImportRunning は、同じカレンダーの取り込みが進んでいることを表す。
	CodeImportRunning = "import_running"
	// CodeReviewChanged は、下見の後に確かめが要る予定が変わったことを表す。
	CodeReviewChanged = "import_preview_changed"
)

// staleRunAfter を過ぎても running の取り込みは、止まった取り込みとみなし、次の取り込みを止めない。
const staleRunAfter = 10 * time.Minute

// Patients は、題名の利用者名で引く事業所の利用者を読む。
type Patients interface {
	ListByFacility(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error)
}

// ServiceCodes は、題名のサービス内容で引くサービスコードを読む。
type ServiceCodes interface {
	ListServiceCodes(ctx context.Context) ([]visit.ServiceCode, error)
}

// Types は、取り込む予定の種類を読む。
type Types interface {
	List(ctx context.Context) ([]schedule.Type, error)
}

// Schedules は、取り込んだ単発の予定を書く。
type Schedules interface {
	Create(ctx context.Context, s schedule.Schedule) error
}

// Recurring は、取り込んだ繰り返しの予定と除外する日を書く。
// AddExclusion は、同じ日付をすでに除外しているときに apperr.ErrConflict を返す。
type Recurring interface {
	Create(ctx context.Context, rs schedule.RecurringSchedule) error
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
}

// VisitInfos は、取り込んだ訪問の予定の訪問の情報を書く。実装は visit.Writer である。
type VisitInfos interface {
	Create(ctx context.Context, facilityID string, in visit.Input) (string, error)
}

// Deps は、Usecase が使うリポジトリと、ほかの機能のデータを読み書きする小さなインターフェイスである。
type Deps struct {
	Calendars Repository
	// Source は、外部のカレンダーを読む。設定が無ければ nil で、読む操作は ErrNotConfigured を返す。
	Source EventSource
	// ServiceAccount は、職員がカレンダーを共有する相手のメールアドレスで、設定が無ければ空である。
	ServiceAccount string
	Staff          kernel.Finder[staff.Ref]
	Patients       Patients
	ServiceCodes   ServiceCodes
	Types          Types
	Schedules      Schedules
	Recurring      Recurring
	// RecurringSchedules は、前の取り込みで繰り返しのまま取り込んだ予定と、その除外の日を読む。
	RecurringSchedules kernel.Finder[schedule.RecurringDetail]
	Visits             VisitInfos
}

// Usecase は、外部のカレンダーの結び付けと、予定の取り込みの操作である。全ての操作は、guard が許すときだけ行う（ADR-0006）。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *Usecase {
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard}
}

// ServiceAccount は、職員がカレンダーを共有する相手のメールアドレスを返す。設定が無ければ ErrNotConfigured を返す。
func (u *Usecase) ServiceAccount(ctx context.Context) (string, error) {
	if err := u.guard(ctx); err != nil {
		return "", err
	}
	if u.deps.Source == nil || u.deps.ServiceAccount == "" {
		return "", ErrNotConfigured
	}
	return u.deps.ServiceAccount, nil
}

// List は、事業所の外していないカレンダーを、最後の取り込みを付けて返す。
func (u *Usecase) List(ctx context.Context, facilityID string) ([]ExternalCalendar, error) {
	if err := u.guard(ctx); err != nil {
		return nil, err
	}
	return u.deps.Calendars.ListByFacility(ctx, facilityID)
}

// Check は、calendarID のカレンダーを読めるかを確かめる。読めないときは ErrUnreadable か ErrUnavailable を包んだエラーを返す。
func (u *Usecase) Check(ctx context.Context, calendarID string) error {
	if err := u.guard(ctx); err != nil {
		return err
	}
	calendarID, err := u.checkSource(calendarID)
	if err != nil {
		return err
	}
	return u.deps.Source.Check(ctx, calendarID)
}

func (u *Usecase) checkSource(calendarID string) (string, error) {
	if u.deps.Source == nil {
		return "", ErrNotConfigured
	}
	calendarID = strings.TrimSpace(calendarID)
	if err := kernel.RequireText("カレンダーの ID", calendarID, maxCalendarIDLen); err != nil {
		return "", err
	}
	return calendarID, nil
}

// Link は、事業所の職員 staffID に、calendarID のカレンダーを結び付ける。読めるかを確かめてから書く。
// 外した同じカレンダーが同じ職員にあれば、結び付け直す。
// 職員が見つからないか別の事業所の職員のときは入力の誤りを、職員にほかのカレンダーがあるか、
// カレンダーがほかの職員に結び付いているか、すでに結び付いているときは apperr.ErrConflict を返す。
func (u *Usecase) Link(ctx context.Context, facilityID, staffID, calendarID string) (ExternalCalendar, error) {
	if err := u.guard(ctx); err != nil {
		return ExternalCalendar{}, err
	}
	calendarID, err := u.checkSource(calendarID)
	if err != nil {
		return ExternalCalendar{}, err
	}
	st, err := u.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return ExternalCalendar{}, apperr.Reference("職員", staffID, err)
	}
	if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
		return ExternalCalendar{}, err
	}
	if err := u.deps.Source.Check(ctx, calendarID); err != nil {
		return ExternalCalendar{}, err
	}
	var linked ExternalCalendar
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := u.deps.Calendars.FindByCalendarID(ctx, ProviderGoogle, calendarID)
		switch {
		case errors.Is(err, apperr.ErrNotFound):
			c := ExternalCalendar{ID: u.ids.NewID(), FacilityID: facilityID, StaffID: st.ID, Provider: ProviderGoogle, CalendarID: calendarID}
			if err := u.deps.Calendars.Create(ctx, c); err != nil {
				return staffTaken(err)
			}
			cur.ID = c.ID
		case err != nil:
			return err
		case cur.StaffID != st.ID:
			return apperr.ConflictCode(CodeCalendarTaken, "このカレンダーは、ほかの職員に結び付いています")
		case cur.DisabledAt == nil:
			return apperr.ConflictCode(CodeCalendarLinked, "このカレンダーは、この職員にすでに結び付いています")
		default:
			if err := u.deps.Calendars.Enable(ctx, cur.ID); err != nil {
				return staffTaken(err)
			}
		}
		linked, err = u.deps.Calendars.Get(ctx, cur.ID)
		return err
	})
	return linked, err
}

// staffTaken は、カレンダーを書く誤りが衝突なら、職員にほかのカレンダーがあることを表す誤りにする。
func staffTaken(err error) error {
	if errors.Is(err, apperr.ErrConflict) {
		return apperr.ConflictCode(CodeStaffHasCalendar, "この職員には、ほかのカレンダーが結び付いています")
	}
	return err
}

// Unlink は、カレンダーを外す。取り込んだ予定と外部の予定の対応は残す。カレンダーが無いか外したときは apperr.ErrNotFound を返す。
func (u *Usecase) Unlink(ctx context.Context, id string) error {
	if err := u.guard(ctx); err != nil {
		return err
	}
	if _, err := u.active(ctx, id); err != nil {
		return err
	}
	return u.deps.Calendars.Disable(ctx, id)
}

// active は、外していないカレンダーを返す。無いか外したときは apperr.ErrNotFound を返す。
func (u *Usecase) active(ctx context.Context, id string) (ExternalCalendar, error) {
	c, err := u.deps.Calendars.Get(ctx, id)
	if err != nil {
		return ExternalCalendar{}, err
	}
	if c.DisabledAt != nil {
		return ExternalCalendar{}, apperr.ErrNotFound
	}
	return c, nil
}

// Preview は、カレンダー id の期間 rng の予定を読み、取り込むとどうなるかを返す。予定は書かない。
// カレンダーが無いか外したときは apperr.ErrNotFound を、読めないときは ErrUnreadable か ErrUnavailable か ErrNotConfigured を返す。
func (u *Usecase) Preview(ctx context.Context, id string, rng Range) (Preview, error) {
	if err := u.guard(ctx); err != nil {
		return Preview{}, err
	}
	c, err := u.active(ctx, id)
	if err != nil {
		return Preview{}, err
	}
	p, _, err := u.plan(ctx, c, rng)
	if err != nil {
		return Preview{}, err
	}
	return Preview{Range: rng, Counts: p.counts, NeedsReview: p.review, Skipped: p.skipped}, nil
}

// ImportResult は、取り込みの記録と、前の取り込みで取り込んでいて今回は書かなかった予定の数である。
type ImportResult struct {
	Run             ImportRun
	AlreadyImported int
}

// Import は、カレンダー id の期間 rng の予定を読み直し、下見と同じ規則で読み替えて、1 つのトランザクションで書く。
// 確かめが要る予定には decisions の取り込み方を当てる。
// 確かめが要る予定の集合が decisions と違うときと、同じカレンダーの取り込みが進んでいるときは apperr.ErrConflict を返し、何も書かない。
// ほかのエラーは Preview と同じである。
func (u *Usecase) Import(ctx context.Context, id string, rng Range, decisions []Decision) (ImportResult, error) {
	if err := u.guard(ctx); err != nil {
		return ImportResult{}, err
	}
	p, ok := principal.From(ctx)
	if !ok {
		return ImportResult{}, fmt.Errorf("%w: 職員を特定できません", apperr.ErrForbidden)
	}
	c, err := u.active(ctx, id)
	if err != nil {
		return ImportResult{}, err
	}
	if u.deps.Source == nil {
		return ImportResult{}, ErrNotConfigured
	}
	run := ImportRun{
		ID: u.ids.NewID(), FacilityID: c.FacilityID, ExternalCalendarID: c.ID, RequestedBy: p.Staff.ID,
		RangeStart: rng.Start, RangeEnd: rng.End, Status: RunRunning,
	}
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := u.deps.Calendars.GetForUpdate(ctx, c.ID); err != nil {
			return err
		}
		running, err := u.deps.Calendars.RunningSince(ctx, c.ID, time.Now().Add(-staleRunAfter))
		if err != nil {
			return err
		}
		if running {
			return apperr.ConflictCode(CodeImportRunning, "このカレンダーの取り込みが進んでいます。終わってから、もう一度下見してください")
		}
		return u.deps.Calendars.CreateRun(ctx, run)
	})
	if err != nil {
		return ImportResult{}, err
	}
	res, err := u.importPlan(ctx, c, rng, decisions, run)
	if err != nil {
		run.Status = RunFailed
		// 取り込みの誤りを返すので、記録の更新の誤りは返さない。止まった記録は staleRunAfter の後に次の取り込みを止めなくなる。
		_, _ = u.deps.Calendars.FinishRun(context.WithoutCancel(ctx), run)
		return ImportResult{}, err
	}
	return res, nil
}

func (u *Usecase) importPlan(ctx context.Context, c ExternalCalendar, rng Range, decisions []Decision, run ImportRun) (ImportResult, error) {
	p, patients, err := u.plan(ctx, c, rng)
	if err != nil {
		return ImportResult{}, err
	}
	chosenSkip, err := p.applyDecisions(decisions, patients)
	if err != nil {
		return ImportResult{}, err
	}
	var res ImportResult
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := u.write(ctx, c, p); err != nil {
			return err
		}
		run.Status = RunSucceeded
		run.ImportedCount = len(p.entries)
		run.SkippedCount = len(p.skipped) + chosenSkip
		finished, err := u.deps.Calendars.FinishRun(ctx, run)
		res = ImportResult{Run: finished, AlreadyImported: p.counts.AlreadyImported}
		return err
	})
	return res, err
}

// plan は、カレンダー c の期間 rng の予定を読み、読み替えた plan と、事業所の利用者を返す。
func (u *Usecase) plan(ctx context.Context, c ExternalCalendar, rng Range) (plan, []PatientRef, error) {
	if u.deps.Source == nil {
		return plan{}, nil, ErrNotConfigured
	}
	events, err := u.deps.Source.Events(ctx, c.CalendarID, rng.TimeMin(), rng.TimeMax())
	if err != nil {
		return plan{}, nil, err
	}
	// 期間の中の回を期間の外へ動かした例外の回は、期間で読むと返らないので、前後を広げて読み、元の日付が期間の中のものを足す
	wide := rng.widened()
	around, err := u.deps.Source.Events(ctx, c.CalendarID, wide.TimeMin(), wide.TimeMax())
	if err != nil {
		return plan{}, nil, err
	}
	events = withMovedExceptions(events, around, rng)
	links, err := u.deps.Calendars.ListLinks(ctx, c.ID)
	if err != nil {
		return plan{}, nil, err
	}
	in := planInput{rng: rng, events: events, links: make(map[string]Link, len(links)), instances: map[string][]Event{}, linkedRecurring: map[string]schedule.RecurringDetail{}}
	for _, l := range links {
		in.links[l.ExternalEventID] = l
	}
	for _, id := range parentsToExpand(events, in.links) {
		instances, err := u.deps.Source.Instances(ctx, c.CalendarID, id, rng.TimeMin(), rng.TimeMax())
		if err != nil {
			return plan{}, nil, err
		}
		in.instances[id] = instances
	}
	for _, ev := range events {
		l, ok := in.links[ev.RecurringEventID]
		if ev.RecurringEventID == "" || !ok || l.RecurringScheduleID == nil {
			continue
		}
		if _, done := in.linkedRecurring[ev.RecurringEventID]; done {
			continue
		}
		rs, err := u.deps.RecurringSchedules.Get(ctx, *l.RecurringScheduleID)
		if err != nil {
			return plan{}, nil, err
		}
		in.linkedRecurring[ev.RecurringEventID] = rs
	}
	pats, err := u.deps.Patients.ListByFacility(ctx, c.FacilityID, patient.ListQuery{Sort: kernel.Sort{Field: "name"}})
	if err != nil {
		return plan{}, nil, err
	}
	in.patients = make([]PatientRef, len(pats))
	for i, p := range pats {
		in.patients[i] = PatientRef{ID: p.ID, Name: p.Name, AssignedStaffName: p.AssignedStaffName}
	}
	if in.serviceCodes, err = u.deps.ServiceCodes.ListServiceCodes(ctx); err != nil {
		return plan{}, nil, err
	}
	return buildPlan(in), in.patients, nil
}

// write は、p の予定と除外する日と予定の対応を書く。トランザクションの中で呼ぶ。
func (u *Usecase) write(ctx context.Context, c ExternalCalendar, p plan) error {
	types, err := u.deps.Types.List(ctx)
	if err != nil {
		return err
	}
	byCode := make(map[schedule.TypeCode]schedule.Type, len(types))
	for _, t := range types {
		byCode[t.Code] = t
	}
	created := map[string]string{}
	ex := excluder{recurring: u.deps.Recurring, done: map[replacement]bool{}}
	for _, e := range p.entries {
		if e.rule == nil {
			continue
		}
		slot, typ, err := u.slot(ctx, c, e, byCode)
		if err != nil {
			return err
		}
		rs, err := schedule.NewRecurring(u.ids.NewID(), slot, typ, e.rule.Rule)
		if err != nil {
			return err
		}
		if err := u.deps.Recurring.Create(ctx, rs); err != nil {
			return err
		}
		for _, d := range e.rule.ExclusionDates {
			if err := ex.exclude(ctx, rs.ID, d); err != nil {
				return err
			}
		}
		created[e.event.ID] = rs.ID
		if err := u.link(ctx, c, e, nil, &rs.ID); err != nil {
			return err
		}
	}
	resolve := func(r replacement) string {
		if r.recurringScheduleID != "" {
			return r.recurringScheduleID
		}
		return created[r.parentEventID]
	}
	for _, x := range p.exclusions {
		if id := resolve(x); id != "" {
			if err := ex.exclude(ctx, id, x.date); err != nil {
				return err
			}
		}
	}
	for _, e := range p.entries {
		if e.rule != nil {
			continue
		}
		slot, typ, err := u.slot(ctx, c, e, byCode)
		if err != nil {
			return err
		}
		sc, err := schedule.New(u.ids.NewID(), slot, typ)
		if err != nil {
			return err
		}
		if e.replaces != nil {
			// 親を取り込まないと選んだときは、置き換える繰り返しの予定が無いので、単発の予定にする。
			if id := resolve(*e.replaces); id != "" {
				if err := ex.exclude(ctx, id, e.replaces.date); err != nil {
					return err
				}
				d := e.replaces.date
				sc.RecurringScheduleID, sc.OriginalDate = &id, &d
			}
		}
		if err := u.deps.Schedules.Create(ctx, sc); err != nil {
			return err
		}
		if err := u.link(ctx, c, e, &sc.ID, nil); err != nil {
			return err
		}
	}
	return nil
}

// excluder は、繰り返しの予定から回を除外する。1 回の取り込みで同じ回を 2 回は書かない。
// PostgreSQL は一意の制約の違反でトランザクションを続けられなくなるので、違反を起こさずに重なりを除く。
type excluder struct {
	recurring Recurring
	done      map[replacement]bool
}

func (x excluder) exclude(ctx context.Context, recurringScheduleID string, d civil.Date) error {
	key := replacement{recurringScheduleID: recurringScheduleID, date: d}
	if x.done[key] {
		return nil
	}
	x.done[key] = true
	return x.recurring.AddExclusion(ctx, recurringScheduleID, d)
}

// slot は、取り込む予定 e の枠と種類を組み立てる。訪問の予定なら訪問の情報を書く。
func (u *Usecase) slot(ctx context.Context, c ExternalCalendar, e entry, types map[schedule.TypeCode]schedule.Type) (schedule.Slot, schedule.Type, error) {
	slot := schedule.Slot{
		FacilityID: c.FacilityID,
		StaffID:    c.StaffID,
		Date:       e.cand.Date,
		StartTime:  e.cand.StartTime,
		EndTime:    e.cand.EndTime,
	}
	code := schedule.CodeNormal
	if e.cand.Kind == KindVisit {
		code = schedule.CodeVisit
		id, err := u.deps.Visits.Create(ctx, c.FacilityID, visit.Input{
			PatientID: e.patientID, AssignedStaffID: c.StaffID, ServiceCodeID: e.serviceCodeID,
		})
		if err != nil {
			return schedule.Slot{}, schedule.Type{}, err
		}
		slot.VisitInfoID = &id
	} else {
		title := e.cand.Title
		slot.Title = &title
	}
	typ, ok := types[code]
	if !ok {
		return schedule.Slot{}, schedule.Type{}, fmt.Errorf("予定の種類 %s がマスタに無い", code)
	}
	return slot, typ, nil
}

func (u *Usecase) link(ctx context.Context, c ExternalCalendar, e entry, scheduleID, recurringScheduleID *string) error {
	l := Link{
		ID: u.ids.NewID(), FacilityID: c.FacilityID, ExternalCalendarID: c.ID, ExternalEventID: e.event.ID,
		ETag: e.event.ETag, ScheduleID: scheduleID, RecurringScheduleID: recurringScheduleID,
	}
	if e.parentID != "" {
		parent := e.parentID
		l.RecurringEventID = &parent
	}
	return u.deps.Calendars.CreateLink(ctx, l)
}
