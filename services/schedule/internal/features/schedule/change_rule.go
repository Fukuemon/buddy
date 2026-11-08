package schedule

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// ChangeRule は、繰り返しの予定の規則を、適用の日以降の回について変える（ADR-0037）。
type ChangeRule struct {
	recurring RecurringRepository
	staff     StaffRefs
	locks     FacilityLock
	types     TypeRepository
	visits    VisitInfos
	now       func() time.Time
	exports   Exports
	tx        tx.Transactor
	ids       kernel.IDGenerator
}

// NewChangeRule は ChangeRule を作る。exports は、予定の変更を外部のカレンダーへの書き出しの待ちに積む。nil なら積まない。
// now は、適用の日と終了日を比べる今日を決める時刻である。nil なら time.Now を使う。
func NewChangeRule(recurring RecurringRepository, staff StaffRefs, locks FacilityLock, types TypeRepository, visits VisitInfos, now func() time.Time, exports Exports, tx tx.Transactor, ids kernel.IDGenerator) ChangeRule {
	if now == nil {
		now = time.Now
	}
	return ChangeRule{recurring: recurring, staff: staff, locks: locks, types: types, visits: visits, now: now, exports: exports, tx: tx, ids: ids}
}

// Do は、繰り返しの予定 recurringScheduleID の規則を、effective 以降の回について rule に変え、effective 以降の回を持つ繰り返しの予定を返す。
// 当て方は PlanRuleChange が決める。繰り返しの予定を分けるときは、元の繰り返しの予定の終了日を適用の日の前の日にし、
// 時刻、職員、訪問の情報を写した新しい繰り返しの予定を作る。置き換えた回の単発の予定は、元の繰り返しの予定を指したまま残す。
// 繰り返しの予定が見つからないときは apperr.ErrNotFound を、入力が規則に合わないときは入力のエラーを、
// 事業所が buddy を予定の正本にしていないとき（code は CodeGooglePrimary）は apperr.ErrConflict を返す。
func (s ChangeRule) Do(ctx context.Context, recurringScheduleID string, effective *civil.Date, rule RuleInput) (RecurringSchedule, error) {
	var out RecurringSchedule
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		rs, err := s.recurring.GetForUpdate(ctx, recurringScheduleID)
		if err != nil {
			return err
		}
		if err := lockWritable(ctx, s.locks, rs.FacilityID); err != nil {
			return err
		}
		if err := RequireScheduleAccess(ctx, s.staff, rs.StaffID, true); err != nil {
			return err
		}
		plan, err := PlanRuleChange(rs.RecurringSchedule, effective, Rule(rule), civil.Today(s.now()))
		if err != nil {
			return err
		}
		if plan.Kind == RuleChangeSplit {
			out, err = s.split(ctx, rs, plan)
			return err
		}
		if err := s.recurring.UpdateRule(ctx, plan.Next); err != nil {
			return err
		}
		if plan.ExclusionsFrom != nil {
			if err := s.recurring.RemoveUnreplacedExclusions(ctx, rs.ID, *plan.ExclusionsFrom); err != nil {
				return err
			}
		}
		out = plan.Next
		return recurringChanged(ctx, s.exports, rs.Slot, rs.ID)
	})
	return out, err
}

// split は、元の繰り返しの予定 rs を plan.Kept の終了日で終え、plan.Next の規則と最初の日付で、rs の時刻、職員、訪問の情報を写した
// 新しい繰り返しの予定を作る。訪問の情報は、新しい繰り返しの予定の行に新しく作る。訪問の情報の行は、1 つの予定だけが指すためである。
// 元の職員と訪問の情報の職員は、休職か退職でも同じ役割のまま写せる。回の置き換えと同じである。
func (s ChangeRule) split(ctx context.Context, rs StoredRecurring, plan RuleChange) (RecurringSchedule, error) {
	if err := s.recurring.UpdateRule(ctx, plan.Kept); err != nil {
		return RecurringSchedule{}, err
	}
	in := SlotInput{
		TypeID: rs.TypeID, Date: plan.Next.Date, StartTime: rs.StartTime, EndTime: rs.EndTime, EndsNextDay: rs.EndsNextDay,
		StaffID: rs.StaffID, Title: rs.Title, Description: rs.Description, Visit: visitInputOf(rs.Visit),
	}
	slot, typ, err := prepareSlot(ctx, s.types, s.staff, s.visits, s.now, rs.FacilityID, in, assignedOf(rs.StaffID, rs.Visit))
	if err != nil {
		return RecurringSchedule{}, err
	}
	next, err := NewRecurring(s.ids.NewID(), slot, typ, plan.Next.Rule)
	if err != nil {
		return RecurringSchedule{}, err
	}
	if err := s.recurring.Create(ctx, next); err != nil {
		return RecurringSchedule{}, err
	}
	// 置き換えた回の元の日には、新しい規則の回を出さない。その日の訪問は職員が移したためである（ADR-0037）
	replaced, err := s.recurring.ReplacedDates(ctx, rs.ID, next.Date)
	if err != nil {
		return RecurringSchedule{}, err
	}
	for _, d := range replaced {
		if next.HasOccurrenceOn(d) {
			if err := s.recurring.AddExclusion(ctx, next.ID, d); err != nil {
				return RecurringSchedule{}, err
			}
		}
	}
	if err := recurringChanged(ctx, s.exports, rs.Slot, rs.ID); err != nil {
		return RecurringSchedule{}, err
	}
	return next, recurringChanged(ctx, s.exports, next.Slot, next.ID)
}

// visitInputOf は、保存した訪問の情報 v を、同じ内容の訪問の情報を作る入力にする。v が nil なら nil を返す。
func visitInputOf(v *visit.Info) *visit.Input {
	if v == nil {
		return nil
	}
	return &visit.Input{PatientID: v.PatientID, AssignedStaffID: v.AssignedStaffID, CompanionID: v.CompanionID, ServiceCodeID: v.ServiceCodeID, CategoryIDs: v.CategoryIDs}
}
