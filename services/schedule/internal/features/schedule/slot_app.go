package schedule

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

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

// occurrence は、単発の予定が置き換える繰り返しの予定の回である。
// kept は、繰り返しの予定に割り振った職員である。
type occurrence struct {
	recurringScheduleID string
	originalDate        civil.Date
	kept                assignment
}

// createSchedule は、単発の予定を作る。replaces は、繰り返しの予定の回を置き換えるときだけ指定する。
// 回を置き換えるときは、繰り返しの予定に割り振った職員を、休職か退職でも同じ役割のまま保存できる（requireAssignable）。
func createSchedule(ctx context.Context, schedules Repository, ids kernel.IDGenerator, types TypeRepository, staff StaffRefs, visits VisitInfos, now func() time.Time, exports Exports, facilityID string, in SlotInput, replaces *occurrence) (Detail, error) {
	var kept assignment
	if replaces != nil {
		kept = replaces.kept
	}
	slot, typ, err := prepareSlot(ctx, types, staff, visits, now, facilityID, in, kept)
	if err != nil {
		return Detail{}, err
	}
	sc, err := New(ids.NewID(), slot, typ)
	if err != nil {
		return Detail{}, err
	}
	if replaces != nil {
		sc.RecurringScheduleID = &replaces.recurringScheduleID
		sc.OriginalDate = &replaces.originalDate
	}
	if err := schedules.Create(ctx, sc); err != nil {
		return Detail{}, err
	}
	if err := scheduleChanged(ctx, exports, sc.Slot, sc.ID); err != nil {
		return Detail{}, err
	}
	return schedules.Get(ctx, sc.ID)
}

// scheduleChanged は、単発の予定 id の変更を書き出しの待ちに積む。トランザクションの中で呼ぶ。
func scheduleChanged(ctx context.Context, exports Exports, slot Slot, id string) error {
	if exports == nil {
		return nil
	}
	return exports.ScheduleChanged(ctx, slot.FacilityID, slot.StaffID, id)
}

// recurringChanged は、繰り返しの予定 id の変更を書き出しの待ちに積む。トランザクションの中で呼ぶ。
func recurringChanged(ctx context.Context, exports Exports, slot Slot, id string) error {
	if exports == nil {
		return nil
	}
	return exports.RecurringChanged(ctx, slot.FacilityID, slot.StaffID, id)
}

// prepareSlot は、予定の種類と職員と、職員の予定を編集する権限を確認し、訪問の情報があれば保存して、予定の属性を組み立てる。
// 予定の職員、主訪問者、同行者のうち、kept の同じ役割の職員と違う職員が休職か退職なら、入力のエラーを返す。kept は、予定に既に割り振った職員と利用者である。
// 利用の終了の利用者は、kept の利用者のまま、今日より前の予定でだけ保存できる（ADR-0021）。退職した職員と同じく、利用の終了の利用者に今日以降の予定を残さない。
// 職員の状態を確認する前に、事業所の職員の休職と退職をトランザクションの終わりまで待たせ、確認した後に状態が変わらないようにする。
// 訪問の情報を保存するので、トランザクションの中で呼ぶ。
func prepareSlot(ctx context.Context, types TypeRepository, staff StaffRefs, visits VisitInfos, now func() time.Time, facilityID string, in SlotInput, kept assignment) (Slot, Type, error) {
	typ, err := types.Get(ctx, in.TypeID)
	if err != nil {
		return Slot{}, Type{}, apperr.Reference("予定の種類", in.TypeID, err)
	}
	if err := staff.LockStatuses(ctx, facilityID); err != nil {
		return Slot{}, Type{}, err
	}
	today := civil.Today(now())
	st, err := staff.Get(ctx, in.StaffID)
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
		id, err := visits.Create(ctx, facilityID, vin)
		if err != nil {
			return Slot{}, Type{}, err
		}
		// 訪問の情報の保存が、主訪問者と同行者がいて同じ事業所にいることを確認している
		visitStaff := map[string]string{in.Visit.AssignedStaffID: kept.assignedStaffID}
		if in.Visit.CompanionID != nil {
			visitStaff[*in.Visit.CompanionID] = kept.companionID
		}
		for staffID, keptID := range visitStaff {
			ref, err := staff.Get(ctx, staffID)
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
