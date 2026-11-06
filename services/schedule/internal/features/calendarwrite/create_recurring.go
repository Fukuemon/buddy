package calendarwrite

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CreateRecurring は、google_primary の事業所に、繰り返しの予定を Google カレンダーの 1 つの繰り返しの予定として書いて作る（ADR-0026）。
type CreateRecurring struct {
	create Create
}

// NewCreateRecurring は CreateRecurring を作る。引数は NewCreate と同じである。
func NewCreateRecurring(locks FacilityLock, cutovers Cutovers, types kernel.Finder[schedule.Type], staffRefs kernel.Finder[staff.Ref], staffNames kernel.Finder[staff.Detail],
	visits VisitInfos, details VisitDetails, calendars Calendars, records RecordRepository, projections Projections, accounts calendar.Accounts,
	now func() time.Time, tx tx.Transactor) CreateRecurring {
	return CreateRecurring{create: NewCreate(locks, cutovers, types, staffRefs, staffNames, visits, details, calendars, records, projections, accounts, now, tx)}
}

// Do は、事業所 facilityID に、画面が決めた ID が id の繰り返しの予定を、予定の職員のカレンダーに書いて作り、書いた繰り返しの予定を返す。
// Google の予定は、書き出しと同じ RRULE の繰り返しの予定（calendar.RecurringBody）を 1 つ作る。入力と規則は schedule.PrepareRecurring で確認する。
// 訪問の情報と保留の版は、単発の予定と同じく id の記録に持つ。手順、送り直し、エラーは Create.Do と同じで、
// 入力と参照のエラーは schedule.CreateRecurring と同じである。
func (c CreateRecurring) Do(ctx context.Context, facilityID, id string, in schedule.SlotInput, rule schedule.RuleInput) (scheduleview.RecurringDetail, error) {
	cr := c.create
	w, ev, err := cr.run(ctx, facilityID, id, func(ctx context.Context) (write, string, *string, error) {
		rs, typ, err := schedule.PrepareRecurring(ctx, cr.types, cr.staffRefs, cr.visits, cr.now, facilityID, id, in, rule)
		if err != nil {
			return write{}, "", nil, err
		}
		st, err := cr.staffNames.Get(ctx, rs.StaffID)
		if err != nil {
			return write{}, "", nil, err
		}
		rd := scheduleview.RecurringDetail{RecurringSchedule: rs, TypeName: typ.Name, StaffName: st.Username, ExclusionDates: []civil.Date{}}
		w := write{recurring: &rd}
		if err := w.useVisit(ctx, cr.details, rs.VisitInfoID); err != nil {
			return write{}, "", nil, err
		}
		w.body = calendar.RecurringBody(rd, nil)
		return w, rs.StaffID, rs.VisitInfoID, nil
	})
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	d := resultOf(scheduleview.Detail{}, w.version, ev, cr.now())
	rd := *w.recurring
	rd.Version, rd.CreatedAt, rd.UpdatedAt = d.Version, d.CreatedAt, d.UpdatedAt
	return rd, nil
}
