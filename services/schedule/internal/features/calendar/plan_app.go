package calendar

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// staffBlocked は、カレンダー c を結び付けた職員に新しい予定を作らない理由を返す。休職なら SkipStaffOnLeave を、
// 訪問しない職員なら SkipStaffNonVisiting を、どちらでもなければ空を返す。退職した職員は、カレンダーを外したものとみなし、
// apperr.ErrNotFound を返す。退職はカレンダーを外すが、外す前に退職にした職員のカレンダーが残っていても取り込まないためである。
func (u *App) staffBlocked(ctx context.Context, c ExternalCalendar) (SkipReason, error) {
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
func (u *App) plan(ctx context.Context, src EventSource, c ExternalCalendar, rng Range, blocked SkipReason) (plan, []PatientRef, error) {
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
