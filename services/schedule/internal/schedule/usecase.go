package schedule

import (
	"context"
	"fmt"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
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
type SlotInput struct {
	TypeID      string
	Date        civil.Date
	StartTime   civil.Time
	EndTime     civil.Time
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

// ListTypes は、予定の種類を返す。
func (s *Usecase) ListTypes(ctx context.Context) ([]Type, error) {
	return s.deps.Types.List(ctx)
}

// Get は、単発の予定を返す。
func (s *Usecase) Get(ctx context.Context, id string) (Detail, error) {
	d, err := s.deps.Schedules.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := s.authorize(ctx, d.StaffID, false); err != nil {
		return Detail{}, err
	}
	return d, nil
}

// GetRecurring は、繰り返しの予定を返す。
func (s *Usecase) GetRecurring(ctx context.Context, id string) (RecurringDetail, error) {
	d, err := s.deps.Recurring.Get(ctx, id)
	if err != nil {
		return RecurringDetail{}, err
	}
	if err := s.authorize(ctx, d.StaffID, false); err != nil {
		return RecurringDetail{}, err
	}
	return d, nil
}

// List は、事業所の予定のうち、見てよい職員の予定を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (s *Usecase) List(ctx context.Context, facilityID string, q ListQuery) (List, error) {
	if err := q.Validate(); err != nil {
		return List{}, err
	}
	p, err := current(ctx)
	if err != nil {
		return List{}, err
	}
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return List{}, err
	}
	readable, err := s.readableStaff(ctx, p, facilityID)
	if err != nil {
		return List{}, err
	}
	single, err := s.deps.Schedules.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return List{}, err
	}
	recurring, err := s.deps.Recurring.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return List{}, err
	}
	return List{
		Schedules:          filter(single, func(d Detail) bool { return readable(d.StaffID) }),
		RecurringSchedules: filter(recurring, func(d RecurringDetail) bool { return readable(d.StaffID) }),
	}, nil
}

// readableStaff は、事業所の職員のうち、p が予定を見てよい職員かを返す関数を返す。
func (s *Usecase) readableStaff(ctx context.Context, p principal.Principal, facilityID string) (func(staffID string) bool, error) {
	if CanReadAll(p) {
		return func(string) bool { return true }, nil
	}
	members, err := s.deps.Staff.ListByFacility(ctx, facilityID)
	if err != nil {
		return nil, err
	}
	return readable(p, members), nil
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

// current は、認証のミドルウェアが ctx に入れた職員を返す。入っていなければ apperr.ErrForbidden を返す。
func current(ctx context.Context) (principal.Principal, error) {
	p, ok := principal.From(ctx)
	if !ok {
		return principal.Principal{}, fmt.Errorf("%w: 職員を特定できません", apperr.ErrForbidden)
	}
	return p, nil
}

// authorize は、ctx の職員が、職員 staffID の予定を見てよいか（edit なら編集してよいか）を確認する。
func (s *Usecase) authorize(ctx context.Context, staffID string, edit bool) error {
	p, err := current(ctx)
	if err != nil {
		return err
	}
	st, err := s.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return err
	}
	return allow(p, st, edit)
}

// Create は、事業所に単発の予定を作る。訪問の情報があれば同じトランザクションで保存する。
// 事業所が見つからないときは apperr.ErrNotFound を、参照が見つからないか別の事業所のものであるときは入力のエラーを返す。
func (s *Usecase) Create(ctx context.Context, facilityID string, in SlotInput) (Detail, error) {
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return Detail{}, err
	}
	var created Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		created, err = s.createSchedule(ctx, facilityID, in, nil)
		return err
	})
	return created, err
}

// CreateRecurring は、事業所に繰り返しの予定を作る。エラーは Create と同じである。
func (s *Usecase) CreateRecurring(ctx context.Context, facilityID string, in SlotInput, rule RuleInput) (RecurringDetail, error) {
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return RecurringDetail{}, err
	}
	r, err := NewRule(Rule(rule))
	if err != nil {
		return RecurringDetail{}, err
	}
	var created RecurringDetail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		slot, typ, err := s.prepareSlot(ctx, facilityID, in, assignment{})
		if err != nil {
			return err
		}
		rs, err := NewRecurring(s.ids.NewID(), slot, typ, r)
		if err != nil {
			return err
		}
		if err := s.deps.Recurring.Create(ctx, rs); err != nil {
			return err
		}
		if err := s.recurringChanged(ctx, rs.Slot, rs.ID); err != nil {
			return err
		}
		created, err = s.deps.Recurring.Get(ctx, rs.ID)
		return err
	})
	return created, err
}

// ChangeOccurrence は、繰り返しの予定の originalDate の回を、in の内容の単発の予定に置き換える。
// 元の回は繰り返しの予定から除外し、作った単発の予定を返す。
// 繰り返しの予定が見つからないときは apperr.ErrNotFound を、originalDate が回に当たらないときは入力のエラーを、
// その回をすでに置き換えたときは apperr.ErrConflict を返す。
func (s *Usecase) ChangeOccurrence(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in SlotInput) (Detail, error) {
	rs, err := s.deps.Recurring.Get(ctx, recurringScheduleID)
	if err != nil {
		return Detail{}, err
	}
	if err := s.authorize(ctx, rs.StaffID, true); err != nil {
		return Detail{}, err
	}
	if !rs.Occurs(originalDate) {
		return Detail{}, apperr.Invalid("%s は繰り返しの予定の回に当たりません", originalDate)
	}
	var created Detail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.deps.Recurring.AddExclusion(ctx, rs.ID, originalDate); err != nil {
			return apperr.AsConflict(err, "%s の回はすでに置き換えられています", originalDate)
		}
		var err error
		created, err = s.createSchedule(ctx, rs.FacilityID, in, &occurrence{recurringScheduleID: rs.ID, originalDate: originalDate, kept: assignedOf(rs.StaffID, rs.Visit)})
		if err != nil {
			return err
		}
		return s.recurringChanged(ctx, rs.Slot, rs.ID)
	})
	return created, err
}

// Cancel は、単発の予定をキャンセルする。予定が見つからないときは apperr.ErrNotFound を、
// キャンセル済みのときは apperr.ErrConflict を返す。
func (s *Usecase) Cancel(ctx context.Context, scheduleID, reason string) (Cancel, error) {
	c, err := NewCancel(s.ids.NewID(), scheduleID, reason)
	if err != nil {
		return Cancel{}, err
	}
	// Update と同じ行のロックの中で権限を確認し、確認した後に予定の職員が替わらないようにする。
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.deps.Schedules.GetForUpdate(ctx, scheduleID)
		if err != nil {
			return err
		}
		if err := s.authorize(ctx, cur.StaffID, true); err != nil {
			return err
		}
		if err := apperr.AsConflict(s.deps.Schedules.CreateCancel(ctx, c), "この予定はすでにキャンセルされています"); err != nil {
			return err
		}
		return s.scheduleChanged(ctx, cur.Slot, cur.ID)
	})
	if err != nil {
		return Cancel{}, err
	}
	return c, nil
}

// Update は、単発の予定の枠を in の内容に置き換える。訪問の情報は in の内容で作り直し、前の訪問の情報は消す。
// 予定が見つからないときは apperr.ErrNotFound を、キャンセル済みのときは apperr.ErrConflict を、
// 参照が見つからないか別の事業所のものであるときは入力のエラーを返す。
func (s *Usecase) Update(ctx context.Context, scheduleID string, in SlotInput) (Detail, error) {
	var updated Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.deps.Schedules.GetForUpdate(ctx, scheduleID)
		if err != nil {
			return err
		}
		if err := s.authorize(ctx, cur.StaffID, true); err != nil {
			return err
		}
		if cur.Cancel != nil {
			return apperr.Conflict("キャンセル済みの予定は変えられません")
		}
		slot, typ, err := s.prepareSlot(ctx, cur.FacilityID, in, assignedOf(cur.StaffID, cur.Visit))
		if err != nil {
			return err
		}
		sc, err := New(cur.ID, slot, typ)
		if err != nil {
			return err
		}
		if err := s.deps.Schedules.Update(ctx, sc); err != nil {
			return err
		}
		if cur.VisitInfoID != nil {
			if err := s.deps.Visits.DeleteIfUnused(ctx, *cur.VisitInfoID); err != nil {
				return err
			}
		}
		// 職員が替わったときも、前の職員のカレンダーの予定は対応から消せるので、新しい職員で積む。
		if err := s.scheduleChanged(ctx, sc.Slot, sc.ID); err != nil {
			return err
		}
		updated, err = s.deps.Schedules.Get(ctx, cur.ID)
		return err
	})
	return updated, err
}

// occurrence は、単発の予定が置き換える繰り返しの予定の回である。
// kept は、繰り返しの予定に割り振った職員である。
type occurrence struct {
	recurringScheduleID string
	originalDate        civil.Date
	kept                assignment
}

// createSchedule は、単発の予定を作る。replaces は、繰り返しの予定の回を置き換えるときだけ指定する。
// 回を置き換えるときは、繰り返しの予定に割り振った職員を、休職か退職でも同じ役割のまま保存できる（assignable）。
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

// assignment は、予定に既に割り振った職員を役割ごとに持つ。役割に職員がいなければ空である。
type assignment struct {
	staffID         string
	assignedStaffID string
	companionID     string
}

// assignedOf は、予定の職員 staffID と訪問の情報 v から、予定に割り振った職員を返す。
func assignedOf(staffID string, v *visit.Detail) assignment {
	a := assignment{staffID: staffID}
	if v != nil {
		a.assignedStaffID = v.AssignedStaffID
		if v.CompanionID != nil {
			a.companionID = *v.CompanionID
		}
	}
	return a
}

// assignable は、date の予定に職員 st を割り振れるかを確認する。keptID は、同じ役割に既に割り振った職員である。
// 既に割り振った職員は、休職でも割り振ったまま保存できる。退職した職員は、今日 today より前の予定でだけ保存できる。
// 退職した職員に、誰も行かない今日以降の予定を残さないためである（ADR-0018）。
func assignable(st staff.Ref, keptID string, date, today civil.Date) error {
	if keptID != "" && st.ID == keptID && (st.Status != staff.StatusRetired || date.Before(today)) {
		return nil
	}
	return st.Assignable()
}

// prepareSlot は、予定の種類と職員と、職員の予定を編集する権限を確認し、訪問の情報があれば保存して、予定の属性を組み立てる。
// 予定の職員、主訪問者、同行者のうち、kept の同じ役割の職員と違う職員が休職か退職なら、入力のエラーを返す。kept は、予定に既に割り振った職員である。
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
	if err := allow(p, st, true); err != nil {
		return Slot{}, Type{}, err
	}
	if err := assignable(st, kept.staffID, in.Date, today); err != nil {
		return Slot{}, Type{}, err
	}
	slot := Slot{
		FacilityID:  facilityID,
		StaffID:     st.ID,
		Date:        in.Date,
		StartTime:   in.StartTime,
		EndTime:     in.EndTime,
		Title:       in.Title,
		Description: in.Description,
	}
	if in.Visit != nil {
		if typ.Code != CodeVisit {
			return Slot{}, Type{}, apperr.Invalid("訪問の情報は訪問の予定にだけ付けられます")
		}
		id, err := s.deps.Visits.Create(ctx, facilityID, *in.Visit)
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
			if err := assignable(ref, keptID, in.Date, today); err != nil {
				return Slot{}, Type{}, err
			}
		}
		slot.VisitInfoID = &id
	}
	return slot, typ, nil
}
