package calendar

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
)

// maxCalendarIDLen は、外部のカレンダーの ID の長さの上限である。テーブルのカラムの長さと同じにする。
const maxCalendarIDLen = 1024

// 衝突の原因の code。httpapi が 409 のレスポンスの code にする。
const (
	// CodeCalendarTaken は、カレンダーがほかの職員に結び付いていることを表す。外したカレンダーを含む。
	CodeCalendarTaken = "calendar_taken"
	// CodeCalendarLinked は、カレンダーがその職員にすでに結び付いていることを表す。
	CodeCalendarLinked = "calendar_already_linked"
	// CodeStaffHasCalendar は、職員にほかのカレンダーが結び付いていることを表す。
	CodeStaffHasCalendar = "staff_has_calendar"
	// CodeImportRunning は、同じカレンダーの取り込みが進んでいることを表す。
	CodeImportRunning = "import_running"
	// CodeReviewChanged は、プレビューの後に確認が必要な予定が変わったことを表す。
	CodeReviewChanged = "import_preview_changed"
	// CodeExportNotInReview は、書き直そうとした書き出しが、確認が必要な状態でないことを表す。
	CodeExportNotInReview = "export_not_in_review"
	// CodeExportNotAcceptable は、外部のカレンダーの内容を buddy に当てられない書き出しであることを表す。
	// 繰り返しの予定と、書けなかった（failed）書き出しが当たる。
	CodeExportNotAcceptable = "export_not_acceptable"
	// CodeExternalChangeUnappliable は、外部のカレンダーの予定を buddy の予定に読み替えられないことを表す。
	CodeExternalChangeUnappliable = "external_change_unappliable"
)

// acceptCallTimeout は、Google の内容に合わせる操作が、予定の行をロックしたまま外部のカレンダーを読む時間の上限である。
const acceptCallTimeout = 20 * time.Second

// staleRunAfter を過ぎても running の取り込みは、止まった取り込みとみなし、次の取り込みを止めない。
const staleRunAfter = 10 * time.Minute

// Patients は、タイトルの利用者名で引く事業所の利用者を読む。
type Patients interface {
	ListByFacility(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error)
}

// ServiceCodes は、タイトルのサービス内容で引くサービスコードを読む。
type ServiceCodes interface {
	ListServiceCodes(ctx context.Context) ([]visit.ServiceCode, error)
}

// Types は、取り込む予定の種類を読む。
type Types interface {
	List(ctx context.Context) ([]schedule.Type, error)
}

// Recurring は、取り込んだ繰り返しの予定と除外する日を書く。
// AddExclusion は、同じ日付をすでに除外しているときに apperr.ErrConflict を返す。
type Recurring interface {
	Create(ctx context.Context, rs schedule.RecurringSchedule) error
	AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error
}

// StaffLocker は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
// 実装は schedule.StaffRefs と同じ postgres.StaffRefRepository である。退職はカレンダーを外すので、職員の状態と
// カレンダーを外したかを読む前にロックを取ると、読んだ後に職員が休職か退職になってカレンダーが外れることが無い。
type StaffLocker interface {
	LockStatuses(ctx context.Context, facilityID string) error
}

// StaffRefs は、カレンダーを結び付ける職員と、その状態を読む。
type StaffRefs interface {
	kernel.Finder[staff.Ref]
	StaffLocker
}

// Deps は、Usecase が使うリポジトリと、ほかの機能のデータを読み書きする小さなインターフェイスである。
type Deps struct {
	Calendars Repository
	// Accounts は、事業所のサービスアカウントで外部のカレンダーを読む。設定が無ければ nil で、読む操作は ErrNotConfigured を返す。
	Accounts     Accounts
	Staff        StaffRefs
	Patients     Patients
	ServiceCodes ServiceCodes
	Types        Types
	// Schedules は、取り込んだ単発の予定を書き、外部のカレンダーの内容を当てる予定を読み書きする。
	Schedules ScheduleStore
	Recurring Recurring
	// RecurringSchedules は、前の取り込みで繰り返しのまま取り込んだ予定と、その除外の日を読む。
	RecurringSchedules kernel.Finder[schedule.RecurringDetail]
	Visits             VisitStore
	// Exports は、Google カレンダーへの書き出しの待ちを読み、書き直す待ちにする。
	Exports ExportRepository
}

// Usecase は、外部のカレンダーの結び付けと、予定の取り込みと、確認が必要な書き出しの操作である。全ての操作は、guard が許すときだけ行う（ADR-0006）。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
	apply applier
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *Usecase {
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard, apply: applier{
		calendars: deps.Calendars, exports: deps.Exports, schedules: deps.Schedules, types: deps.Types,
		patients: deps.Patients, serviceCodes: deps.ServiceCodes, visits: deps.Visits, ids: ids, now: time.Now,
	}}
}

// ServiceAccount は、事業所 facilityID の職員がカレンダーを共有する相手のメールアドレスを返す。設定が無ければ ErrNotConfigured を返す。
func (u *Usecase) ServiceAccount(ctx context.Context, facilityID string) (string, error) {
	if err := u.guard(ctx); err != nil {
		return "", err
	}
	if u.deps.Accounts == nil {
		return "", ErrNotConfigured
	}
	return u.deps.Accounts.ServiceAccount(ctx, facilityID)
}

// source は、事業所 facilityID のサービスアカウントで外部のカレンダーを読む EventSource を返す。設定が無ければ ErrNotConfigured を返す。
func (u *Usecase) source(ctx context.Context, facilityID string) (EventSource, error) {
	if u.deps.Accounts == nil {
		return nil, ErrNotConfigured
	}
	return u.deps.Accounts.Source(ctx, facilityID)
}

// List は、事業所の外していないカレンダーを、最後の取り込みを付けて返す。
func (u *Usecase) List(ctx context.Context, facilityID string) ([]ExternalCalendar, error) {
	if err := u.guard(ctx); err != nil {
		return nil, err
	}
	return u.deps.Calendars.ListByFacility(ctx, facilityID)
}

// Check は、事業所 facilityID のサービスアカウントで calendarID のカレンダーを読めるかを確認する。
// 読めないときは ErrUnreadable か ErrUnavailable を包んだエラーを返す。
func (u *Usecase) Check(ctx context.Context, facilityID, calendarID string) error {
	if err := u.guard(ctx); err != nil {
		return err
	}
	src, calendarID, err := u.checkSource(ctx, facilityID, calendarID)
	if err != nil {
		return err
	}
	return src.Check(ctx, calendarID)
}

func (u *Usecase) checkSource(ctx context.Context, facilityID, calendarID string) (EventSource, string, error) {
	src, err := u.source(ctx, facilityID)
	if err != nil {
		return nil, "", err
	}
	calendarID = strings.TrimSpace(calendarID)
	if err := kernel.RequireText("カレンダーの ID", calendarID, maxCalendarIDLen); err != nil {
		return nil, "", err
	}
	return src, calendarID, nil
}

// Link は、事業所の職員 staffID に、calendarID のカレンダーを結び付ける。事業所のサービスアカウントで読めるかを確認してから書く。
// 外した同じカレンダーが同じ職員にあれば、結び付け直す。
// 職員が見つからないか、別の事業所の職員か、退職した職員のときは入力のエラーを、職員にほかのカレンダーがあるか、
// カレンダーがほかの職員に結び付いているか、すでに結び付いているときは apperr.ErrConflict を返す。
func (u *Usecase) Link(ctx context.Context, facilityID, staffID, calendarID string) (ExternalCalendar, error) {
	if err := u.guard(ctx); err != nil {
		return ExternalCalendar{}, err
	}
	src, calendarID, err := u.checkSource(ctx, facilityID, calendarID)
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
	if err := linkable(st); err != nil {
		return ExternalCalendar{}, err
	}
	if err := src.Check(ctx, calendarID); err != nil {
		return ExternalCalendar{}, err
	}
	var linked ExternalCalendar
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		// 退職はカレンダーを外すので、確認した後に退職した職員へ結び付けないよう、ロックしてから読み直す
		if err := u.deps.Staff.LockStatuses(ctx, facilityID); err != nil {
			return err
		}
		if st, err := u.deps.Staff.Get(ctx, st.ID); err != nil {
			return err
		} else if err := linkable(st); err != nil {
			return err
		}
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

// linkable は、職員 st にカレンダーを結び付けられるかを確認する。退職した職員には結び付けられない（ADR-0018）。
func linkable(st staff.Ref) error {
	if st.Status == staff.StatusRetired {
		return apperr.Invalid("退職した職員には、カレンダーを結び付けられません")
	}
	return nil
}

// staffTaken は、カレンダーを書くエラーが衝突なら、職員にほかのカレンダーがあることを表すエラーにする。
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
// 職員が休職していれば、新しい予定を SkipStaffOnLeave の取り込まない予定にする。
// カレンダーが無いか外したとき、職員が退職したときは apperr.ErrNotFound を、読めないときは ErrUnreadable か ErrUnavailable か ErrNotConfigured を返す。
func (u *Usecase) Preview(ctx context.Context, id string, rng Range) (Preview, error) {
	if err := u.guard(ctx); err != nil {
		return Preview{}, err
	}
	c, err := u.active(ctx, id)
	if err != nil {
		return Preview{}, err
	}
	src, err := u.source(ctx, c.FacilityID)
	if err != nil {
		return Preview{}, err
	}
	onLeave, err := u.staffOnLeave(ctx, c)
	if err != nil {
		return Preview{}, err
	}
	p, _, err := u.plan(ctx, src, c, rng, onLeave)
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

// Import は、カレンダー id の期間 rng の予定を読み直し、プレビューと同じ規則で読み替えて、1 つのトランザクションで書く。
// 確認が必要な予定には decisions の取り込み方を当てる。職員が休職していれば、新しい予定は書かない。
// 確認が必要な予定の集合が decisions と違うとき、読み替えた後に職員が休職か復職になったとき、
// 同じカレンダーの取り込みが進んでいるときは apperr.ErrConflict を返し、何も書かない。
// 読み替えた後に職員が退職し、カレンダーが外れたときは apperr.ErrNotFound を返し、何も書かない。
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
	src, err := u.source(ctx, c.FacilityID)
	if err != nil {
		return ImportResult{}, err
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
			return apperr.ConflictCode(CodeImportRunning, "このカレンダーの取り込みが進んでいます。終わってから、もう一度プレビューしてください")
		}
		return u.deps.Calendars.CreateRun(ctx, run)
	})
	if err != nil {
		return ImportResult{}, err
	}
	res, err := u.importPlan(ctx, src, c, rng, decisions, run)
	if err != nil {
		run.Status = RunFailed
		// 取り込みのエラーを返すので、記録の更新のエラーは返さない。止まった記録は staleRunAfter の後に次の取り込みを止めなくなる。
		_, _ = u.deps.Calendars.FinishRun(context.WithoutCancel(ctx), run)
		return ImportResult{}, err
	}
	return res, nil
}

func (u *Usecase) importPlan(ctx context.Context, src EventSource, c ExternalCalendar, rng Range, decisions []Decision, run ImportRun) (ImportResult, error) {
	onLeave, err := u.staffOnLeave(ctx, c)
	if err != nil {
		return ImportResult{}, err
	}
	p, patients, err := u.plan(ctx, src, c, rng, onLeave)
	if err != nil {
		return ImportResult{}, err
	}
	chosenSkip, err := p.applyDecisions(decisions, patients)
	if err != nil {
		return ImportResult{}, err
	}
	var res ImportResult
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := u.recheck(ctx, c, onLeave); err != nil {
			return err
		}
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

// staffOnLeave は、カレンダー c を結び付けた職員が休職しているかを返す。退職した職員は、カレンダーを外したものとみなし、
// apperr.ErrNotFound を返す。退職はカレンダーを外すが、外す前に退職にした職員のカレンダーが残っていても取り込まないためである。
func (u *Usecase) staffOnLeave(ctx context.Context, c ExternalCalendar) (bool, error) {
	st, err := u.deps.Staff.Get(ctx, c.StaffID)
	if err != nil {
		return false, err
	}
	if st.Status == staff.StatusRetired {
		return false, apperr.ErrNotFound
	}
	return st.Status == staff.StatusOnLeave, nil
}

// recheck は、取り込みを書くトランザクションの始めに、事業所の職員の休職、復職、退職を終わりまで待たせてから、
// カレンダーを外していないことと、職員の休職が読み替えたときの onLeave と同じことを確認する。
// 退職は事業所の同じ行に排他のロックを取り、残る予定を数えてカレンダーを外すので、退職とこの取り込みのどちらかが、
// もう片方のコミットを待ってから読む。取り込んだ予定が残れば退職を拒み、退職が先ならここでカレンダーが外れている。
// カレンダーが外れていれば apperr.ErrNotFound を、休職が変わっていれば apperr.ErrConflict を返す。
func (u *Usecase) recheck(ctx context.Context, c ExternalCalendar, onLeave bool) error {
	if err := u.deps.Staff.LockStatuses(ctx, c.FacilityID); err != nil {
		return err
	}
	if _, err := u.active(ctx, c.ID); err != nil {
		return err
	}
	now, err := u.staffOnLeave(ctx, c)
	if err != nil {
		return err
	}
	if now != onLeave {
		return errStaffStatusChanged
	}
	return nil
}

var errStaffStatusChanged = apperr.ConflictCode(CodeReviewChanged, "プレビューの後に、職員が休職か復職になりました。もう一度プレビューしてください")

// plan は、カレンダー c の期間 rng の予定を src で読み、読み替えた plan と、事業所の利用者を返す。
// onLeave は、カレンダーを結び付けた職員が休職しているかで、休職なら新しい予定を取り込まない予定にする。
func (u *Usecase) plan(ctx context.Context, src EventSource, c ExternalCalendar, rng Range, onLeave bool) (plan, []PatientRef, error) {
	events, err := src.Events(ctx, c.CalendarID, rng.TimeMin(), rng.TimeMax())
	if err != nil {
		return plan{}, nil, err
	}
	// 期間の中の回を期間の外へ動かした例外の回は、期間で読むと返らないので、前後を広げて読み、元の日付が期間の中のものを足す
	wide := rng.widened()
	around, err := src.Events(ctx, c.CalendarID, wide.TimeMin(), wide.TimeMax())
	if err != nil {
		return plan{}, nil, err
	}
	events = withMovedExceptions(events, around, rng)
	links, err := u.deps.Calendars.ListLinks(ctx, c.ID)
	if err != nil {
		return plan{}, nil, err
	}
	in := planInput{
		rng: rng, events: events, links: make(map[string]Link, len(links)), instances: map[string][]Event{},
		linkedRecurring: map[string]schedule.RecurringDetail{}, staffOnLeave: onLeave, staffID: c.StaffID,
	}
	for _, l := range links {
		in.links[l.ExternalEventID] = l
	}
	for _, id := range parentsToExpand(events, in.links) {
		instances, err := src.Instances(ctx, c.CalendarID, id, rng.TimeMin(), rng.TimeMax())
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
	synced := createdVersion
	l := Link{
		ID: u.ids.NewID(), FacilityID: c.FacilityID, ExternalCalendarID: c.ID, ExternalEventID: e.event.ID,
		ETag: e.event.ETag, SyncedVersion: &synced, ScheduleID: scheduleID, RecurringScheduleID: recurringScheduleID,
	}
	if e.parentID != "" {
		parent := e.parentID
		l.RecurringEventID = &parent
	}
	return u.deps.Calendars.CreateLink(ctx, l)
}

// ListExportIssues は、事業所の確認が必要な書き出し（外部のカレンダーで変わっていたか、書けなかった予定）を返す。
func (u *Usecase) ListExportIssues(ctx context.Context, facilityID string) ([]ExportIssue, error) {
	if err := u.guard(ctx); err != nil {
		return nil, err
	}
	return u.deps.Exports.ListIssues(ctx, facilityID)
}

// RetryExport は、確認が必要な書き出し id を、外部の予定の変更を比べずに buddy の内容で書き直す待ちにして、待ちを返す。
// 待ちが見つからないときは apperr.ErrNotFound を、確認が必要な待ちでないときは apperr.ErrConflict を返す。
func (u *Usecase) RetryExport(ctx context.Context, id string) (Export, error) {
	if err := u.guard(ctx); err != nil {
		return Export{}, err
	}
	if _, err := u.deps.Exports.Get(ctx, id); err != nil {
		return Export{}, err
	}
	if err := u.deps.Exports.Retry(ctx, id); err != nil {
		if errors.Is(err, apperr.ErrConflict) {
			return Export{}, errNotInReview
		}
		return Export{}, err
	}
	return u.deps.Exports.Get(ctx, id)
}

// AcceptExport は、確認が必要な書き出し id の予定を、buddy での変更によらず外部のカレンダーの今の内容にし、待ちを終えて返す。
// 外部のカレンダーで消された予定は、キャンセルする。予定の職員が、外部の予定のカレンダーの職員と違えば、書き出しの待ちを積み直し、
// 今の職員のカレンダーへ移させる。
// 待ちが見つからないときは apperr.ErrNotFound を、確認が必要な待ちでないとき、外部の内容を当てられない待ちのとき、
// 予定の対応のカレンダーを外したとき（退職を含む）、
// 外部の予定を buddy の予定に読み替えられないときは apperr.ErrConflict を返す。外部のカレンダーを読めないときは Preview と同じである。
func (u *Usecase) AcceptExport(ctx context.Context, id string) (Export, error) {
	if err := u.guard(ctx); err != nil {
		return Export{}, err
	}
	e, err := u.deps.Exports.Get(ctx, id)
	if err != nil {
		return Export{}, err
	}
	if !e.InReview() {
		return Export{}, errNotInReview
	}
	if !e.Acceptable() {
		return Export{}, errNotAcceptable
	}
	// buddy でキャンセルした予定は、外部の内容に戻せない。
	if d, err := u.deps.Schedules.Get(ctx, e.ScheduleID); err != nil {
		return Export{}, err
	} else if d.Cancel != nil {
		return Export{}, errNotAcceptable
	}
	l, err := u.deps.Calendars.LinkBySchedule(ctx, e.ScheduleID)
	if errors.Is(err, apperr.ErrNotFound) {
		return Export{}, errNotAcceptable
	}
	if err != nil {
		return Export{}, err
	}
	c, err := u.deps.Calendars.Get(ctx, l.ExternalCalendarID)
	if err != nil {
		return Export{}, err
	}
	if c.DisabledAt != nil {
		return Export{}, errNotAcceptable
	}
	src, err := u.source(ctx, c.FacilityID)
	if err != nil {
		return Export{}, err
	}
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		// 予定の行をロックしてから Google の予定を読む。同期の処理も同じ行をロックして Google の変更を当てるので、
		// 読んだ後に Google で変わった予定は、同期が後で比べて当てるか確認が必要な待ちにする。
		locked, err := u.deps.Schedules.GetForUpdate(ctx, e.ScheduleID)
		if err != nil {
			return err
		}
		// 退職はカレンダーを外すので、職員の休職、復職、退職を待たせてからカレンダーを読み直す。外したカレンダーの内容を当てると、
		// 退職した職員の予定を今日以降へ動かせるためである。予定の変更と同じく、予定の行のロックの後に取る。
		if err := u.deps.Staff.LockStatuses(ctx, c.FacilityID); err != nil {
			return err
		}
		if now, err := u.deps.Calendars.Get(ctx, c.ID); err != nil {
			return err
		} else if now.DisabledAt != nil {
			return errNotAcceptable
		}
		// 予定をほかの職員に割り振り直した後に、その職員が退職していることもある。退職した職員の予定は Google の内容に合わせない
		if st, err := u.deps.Staff.Get(ctx, locked.StaffID); err != nil {
			return err
		} else if st.Status == staff.StatusRetired {
			return errNotAcceptable
		}
		cur, err := u.deps.Exports.Get(ctx, id)
		if err != nil {
			return err
		}
		switch {
		case !cur.InReview():
			return errNotInReview
		case !cur.Acceptable() || locked.Cancel != nil:
			return errNotAcceptable
		}
		callCtx, cancel := context.WithTimeout(ctx, acceptCallTimeout)
		defer cancel()
		ev, err := externalEvent(callCtx, src, c, l)
		if err != nil {
			return err
		}
		// ロックを取らない RetryExport が、確認した後に書き直す待ちにしたときに当たる。
		if err := u.deps.Exports.Resolve(ctx, id, cur.Revision); errors.Is(err, apperr.ErrConflict) {
			return errNotInReview
		} else if err != nil {
			return err
		}
		err = u.apply.acceptSchedule(ctx, c, l, ev)
		if errors.Is(err, errUnappliable) {
			return apperr.ConflictCode(CodeExternalChangeUnappliable,
				"Google カレンダーの予定を、buddy の予定に読み替えられません。buddy の内容で書き直してください")
		}
		if err != nil {
			return err
		}
		// 職員を替えた予定は、今の職員のカレンダーへ移すために書き出し直す。キャンセルした予定は移さない。
		d, err := u.deps.Schedules.Get(ctx, e.ScheduleID)
		if err != nil || d.StaffID == c.StaffID || d.Cancel != nil {
			return err
		}
		return u.deps.Exports.Enqueue(ctx, u.ids.NewID(), e.Target)
	})
	if err != nil {
		return Export{}, err
	}
	return u.deps.Exports.Get(ctx, id)
}

// externalEvent は、予定の対応 l の外部の予定を読む。予定が見つからず、カレンダーは読めるときは、予定が消されたとみなし、
// 取り消した予定を返す。Google は、消した予定に 404 を返すことがあるためである。
func externalEvent(ctx context.Context, src EventSource, c ExternalCalendar, l Link) (Event, error) {
	ev, err := src.Event(ctx, c.CalendarID, l.ExternalEventID)
	if !errors.Is(err, ErrEventNotFound) {
		return ev, err
	}
	if cerr := src.Check(ctx, c.CalendarID); cerr != nil {
		return Event{}, err
	}
	return Event{ID: l.ExternalEventID, Status: StatusCancelled, ETag: l.ETag}, nil
}

var (
	errNotInReview   = apperr.ConflictCode(CodeExportNotInReview, "この予定は、確認が必要な書き出しではありません")
	errNotAcceptable = apperr.ConflictCode(CodeExportNotAcceptable,
		"この予定は、Google カレンダーの内容を buddy に当てられません。buddy の内容で書き直してください")
)
