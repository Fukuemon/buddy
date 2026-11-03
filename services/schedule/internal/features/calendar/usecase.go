package calendar

import (
	"context"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
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

// Deps は、Usecase が使うリポジトリと、ほかの機能のデータを読み書きする小さなインターフェースである。
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

// source は、事業所 facilityID のサービスアカウントで外部のカレンダーを読む EventSource を返す。設定が無ければ ErrNotConfigured を返す。
func (u *Usecase) source(ctx context.Context, facilityID string) (EventSource, error) {
	if u.deps.Accounts == nil {
		return nil, ErrNotConfigured
	}
	return u.deps.Accounts.Source(ctx, facilityID)
}

func (u *Usecase) requireSource(ctx context.Context, facilityID, calendarID string) (EventSource, string, error) {
	src, err := u.source(ctx, facilityID)
	if err != nil {
		return nil, "", err
	}
	calendarID = strings.TrimSpace(calendarID)
	if err := kernel.ValidateText("カレンダーの ID", calendarID, maxCalendarIDLen); err != nil {
		return nil, "", err
	}
	return src, calendarID, nil
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

// staffBlocked は、カレンダー c を結び付けた職員に新しい予定を作らない理由を返す。休職なら SkipStaffOnLeave を、
// 訪問しない職員なら SkipStaffNonVisiting を、どちらでもなければ空を返す。退職した職員は、カレンダーを外したものとみなし、
// apperr.ErrNotFound を返す。退職はカレンダーを外すが、外す前に退職にした職員のカレンダーが残っていても取り込まないためである。
func (u *Usecase) staffBlocked(ctx context.Context, c ExternalCalendar) (SkipReason, error) {
	st, err := u.deps.Staff.Get(ctx, c.StaffID)
	if err != nil {
		return "", err
	}
	switch {
	case st.Status == staff.StatusRetired:
		return "", apperr.ErrNotFound
	case st.Status == staff.StatusOnLeave:
		return SkipStaffOnLeave, nil
	case st.NonVisiting:
		return SkipStaffNonVisiting, nil
	}
	return "", nil
}

// plan は、カレンダー c の期間 rng の予定を src で読み、読み替えた plan と、事業所の利用者を返す。
// blocked は、カレンダーを結び付けた職員に新しい予定を作らない理由で、空でなければ新しい予定をその理由の取り込まない予定にする。
func (u *Usecase) plan(ctx context.Context, src EventSource, c ExternalCalendar, rng Range, blocked SkipReason) (plan, []PatientRef, error) {
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
		linkedRecurring: map[string]schedule.RecurringDetail{}, staffBlocked: blocked, staffID: c.StaffID,
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
	return newPlan(in), in.patients, nil
}

var (
	errNotInReview   = apperr.ConflictCode(CodeExportNotInReview, "この予定は、確認が必要な書き出しではありません")
	errNotAcceptable = apperr.ConflictCode(CodeExportNotAcceptable,
		"この予定は、Google カレンダーの内容を buddy に当てられません。buddy の内容で書き直してください")
)
