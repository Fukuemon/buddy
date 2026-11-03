package schedule

import (
	"context"
	"fmt"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、Usecase が使うリポジトリと、ほかの機能のデータを読む小さなインターフェイスである。
type Deps struct {
	Facilities kernel.Finder[organization.Facility]
	Staff      StaffRefs
	Visits     VisitInfos
	Schedules  Repository
	Recurring  RecurringRepository
	Types      TypeRepository
	// Exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
	Exports Exports
	// Now は、退職した職員を割り振ったまま保存できる予定の日付を決める時刻である。nil なら time.Now を使う。
	Now func() time.Time
}

// Usecase は、予定の操作である。操作は、ctx の職員（principal.Principal）の権限で判定する。
// 見てよくない予定は一覧から除き、1 件を指す操作には apperr.ErrForbidden を返す。ctx に職員がいなければ apperr.ErrForbidden を返す。
type Usecase struct {
	deps Deps
	tx   tx.Transactor
	ids  kernel.IDGenerator
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator) *Usecase {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &Usecase{deps: deps, tx: tx, ids: ids}
}

// SlotInput は、単発と繰り返しの予定に共通の入力である。Visit は、訪問の予定のときに指定する。
// EndsNextDay は、Date の翌日の EndTime に終わる予定のときに true にする。
type SlotInput struct {
	TypeID      string
	Date        civil.Date
	StartTime   civil.Time
	EndTime     civil.Time
	EndsNextDay bool
	StaffID     string
	Title       *string
	Description *string
	Visit       *visit.Input
}

// RuleInput は、繰り返しの規則の入力である。
type RuleInput struct {
	Frequency   Frequency
	DayOfWeek   *int
	DayOfMonth  *int
	WeekOfMonth *int
	EndDate     *civil.Date
}

// List は、事業所の単発の予定と繰り返しの予定である。
type List struct {
	Schedules          []Detail
	RecurringSchedules []RecurringDetail
}

// current は、認証のミドルウェアが ctx に入れた職員を返す。入っていなければ apperr.ErrForbidden を返す。
func current(ctx context.Context) (principal.Principal, error) {
	p, ok := principal.From(ctx)
	if !ok {
		return principal.Principal{}, fmt.Errorf("%w: 職員を特定できません", apperr.ErrForbidden)
	}
	return p, nil
}

// requireScheduleAccess は、ctx の職員が、職員 staffID の予定を見てよいか（editing なら編集してよいか）を確認する。
func (s *Usecase) requireScheduleAccess(ctx context.Context, staffID string, editing bool) error {
	p, err := current(ctx)
	if err != nil {
		return err
	}
	st, err := s.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return err
	}
	return requireAllowed(p, st, editing)
}

// occurrence は、単発の予定が置き換える繰り返しの予定の回である。
// kept は、繰り返しの予定に割り振った職員である。
type occurrence struct {
	recurringScheduleID string
	originalDate        civil.Date
	kept                assignment
}

// createSchedule は、単発の予定を作る。replaces は、繰り返しの予定の回を置き換えるときだけ指定する。
// 回を置き換えるときは、繰り返しの予定に割り振った職員を、休職か退職でも同じ役割のまま保存できる（requireAssignable）。
func (s *Usecase) createSchedule(ctx context.Context, facilityID string, in SlotInput, replaces *occurrence) (Detail, error) {
	var kept assignment
	if replaces != nil {
		kept = replaces.kept
	}
	slot, typ, err := s.prepareSlot(ctx, facilityID, in, kept)
	if err != nil {
		return Detail{}, err
	}
	sc, err := New(s.ids.NewID(), slot, typ)
	if err != nil {
		return Detail{}, err
	}
	if replaces != nil {
		sc.RecurringScheduleID = &replaces.recurringScheduleID
		sc.OriginalDate = &replaces.originalDate
	}
	if err := s.deps.Schedules.Create(ctx, sc); err != nil {
		return Detail{}, err
	}
	if err := s.scheduleChanged(ctx, sc.Slot, sc.ID); err != nil {
		return Detail{}, err
	}
	return s.deps.Schedules.Get(ctx, sc.ID)
}

// scheduleChanged は、単発の予定 id の変更を書き出しの待ちに積む。トランザクションの中で呼ぶ。
func (s *Usecase) scheduleChanged(ctx context.Context, slot Slot, id string) error {
	if s.deps.Exports == nil {
		return nil
	}
	return s.deps.Exports.ScheduleChanged(ctx, slot.FacilityID, slot.StaffID, id)
}

// recurringChanged は、繰り返しの予定 id の変更を書き出しの待ちに積む。トランザクションの中で呼ぶ。
func (s *Usecase) recurringChanged(ctx context.Context, slot Slot, id string) error {
	if s.deps.Exports == nil {
		return nil
	}
	return s.deps.Exports.RecurringChanged(ctx, slot.FacilityID, slot.StaffID, id)
}

// assignment は、予定に既に割り振った職員を役割ごとに持ち、訪問の予定なら既に付けた利用者を持つ。役割に職員がいなければ空である。
type assignment struct {
	staffID         string
	assignedStaffID string
	companionID     string
	patientID       string
}

// assignedOf は、予定の職員 staffID と訪問の情報 v から、予定に割り振った職員と利用者を返す。
func assignedOf(staffID string, v *visit.Detail) assignment {
	a := assignment{staffID: staffID}
	if v != nil {
		a.assignedStaffID = v.AssignedStaffID
		a.patientID = v.PatientID
		if v.CompanionID != nil {
			a.companionID = *v.CompanionID
		}
	}
	return a
}

// requireAssignable は、date の予定に職員 st を割り振れるかを確認する。keptID は、同じ役割に既に割り振った職員である。
// 既に割り振った職員は、休職でも割り振ったまま保存できる。退職した職員は、今日 today より前の予定でだけ保存できる。
// 退職した職員に、誰も行かない今日以降の予定を残さないためである（ADR-0018）。
func requireAssignable(st staff.Ref, keptID string, date, today civil.Date) error {
	if keptID != "" && st.ID == keptID && (st.Status != staff.StatusRetired || date.Before(today)) {
		return nil
	}
	return st.RequireAssignable()
}

// prepareSlot は、予定の種類と職員と、職員の予定を編集する権限を確認し、訪問の情報があれば保存して、予定の属性を組み立てる。
// 予定の職員、主訪問者、同行者のうち、kept の同じ役割の職員と違う職員が休職か退職なら、入力のエラーを返す。kept は、予定に既に割り振った職員と利用者である。
// 利用の終了の利用者は、kept の利用者のまま、今日より前の予定でだけ保存できる（ADR-0021）。退職した職員と同じく、利用の終了の利用者に今日以降の予定を残さない。
// 職員の状態を確認する前に、事業所の職員の休職と退職をトランザクションの終わりまで待たせ、確認した後に状態が変わらないようにする。
// 訪問の情報を保存するので、トランザクションの中で呼ぶ。
func (s *Usecase) prepareSlot(ctx context.Context, facilityID string, in SlotInput, kept assignment) (Slot, Type, error) {
	typ, err := s.deps.Types.Get(ctx, in.TypeID)
	if err != nil {
		return Slot{}, Type{}, apperr.Reference("予定の種類", in.TypeID, err)
	}
	if err := s.deps.Staff.LockStatuses(ctx, facilityID); err != nil {
		return Slot{}, Type{}, err
	}
	today := civil.Today(s.deps.Now())
	st, err := s.deps.Staff.Get(ctx, in.StaffID)
	if err != nil {
		return Slot{}, Type{}, apperr.Reference("職員", in.StaffID, err)
	}
	if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
		return Slot{}, Type{}, err
	}
	p, err := current(ctx)
	if err != nil {
		return Slot{}, Type{}, err
	}
	if err := requireAllowed(p, st, true); err != nil {
		return Slot{}, Type{}, err
	}
	if err := requireAssignable(st, kept.staffID, in.Date, today); err != nil {
		return Slot{}, Type{}, err
	}
	slot := Slot{
		FacilityID:  facilityID,
		StaffID:     st.ID,
		Date:        in.Date,
		StartTime:   in.StartTime,
		EndTime:     in.EndTime,
		EndsNextDay: in.EndsNextDay,
		Title:       in.Title,
		Description: in.Description,
	}
	if in.Visit != nil {
		if typ.Code != CodeVisit {
			return Slot{}, Type{}, apperr.Invalid("訪問の情報は訪問の予定にだけ付けられます")
		}
		vin := *in.Visit
		vin.KeptPatientID = ""
		if in.Date.Before(today) {
			vin.KeptPatientID = kept.patientID
		}
		id, err := s.deps.Visits.Create(ctx, facilityID, vin)
		if err != nil {
			return Slot{}, Type{}, err
		}
		// 訪問の情報の保存が、主訪問者と同行者がいて同じ事業所にいることを確認している
		visitStaff := map[string]string{in.Visit.AssignedStaffID: kept.assignedStaffID}
		if in.Visit.CompanionID != nil {
			visitStaff[*in.Visit.CompanionID] = kept.companionID
		}
		for staffID, keptID := range visitStaff {
			ref, err := s.deps.Staff.Get(ctx, staffID)
			if err != nil {
				return Slot{}, Type{}, err
			}
			if err := requireAssignable(ref, keptID, in.Date, today); err != nil {
				return Slot{}, Type{}, err
			}
		}
		slot.VisitInfoID = &id
	}
	return slot, typ, nil
}

// StaffRefs は、予定の職員を参照する。Get は、職員が見つからないときに apperr.ErrNotFound を返す。
// LockStatuses は、トランザクションが終わるまで、事業所 facilityID の職員を休職、復職、退職にさせない。
// 職員の状態を確認してから予定を書き終えるまでの間に、職員が休職か退職になるのを防ぐ。
type StaffRefs interface {
	Get(ctx context.Context, id string) (staff.Ref, error)
	ListByFacility(ctx context.Context, facilityID string) ([]staff.Ref, error)
	LockStatuses(ctx context.Context, facilityID string) error
}

// VisitInfos は、訪問の予定に付く訪問の情報を書く。実装は visit.Writer である。
type VisitInfos interface {
	Create(ctx context.Context, facilityID string, in visit.Input) (string, error)
	DeleteIfUnused(ctx context.Context, id string) error
}

// Exports は、予定の変更を、外部のカレンダーへの書き出しの待ちに積む。実装は calendar.Outbox である。
// 予定の職員が外部のカレンダーを結び付けておらず、予定に外部の予定の対応も無ければ、積まずに nil を返す。
// 予定の変更と同じトランザクションの中で呼ぶ。
type Exports interface {
	ScheduleChanged(ctx context.Context, facilityID, staffID, scheduleID string) error
	RecurringChanged(ctx context.Context, facilityID, staffID, recurringScheduleID string) error
}
