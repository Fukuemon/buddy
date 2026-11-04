package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// staffBlocked は、カレンダー c を結び付けた職員に新しい予定を作らない理由を返す。休職なら SkipStaffOnLeave を、
// 訪問しない職員なら SkipStaffNonVisiting を、どちらでもなければ空を返す。退職した職員は、カレンダーを外したものとみなし、
// apperr.ErrNotFound を返す。退職はカレンダーを外すが、外す前に退職にした職員のカレンダーが残っていても取り込まないためである。
func staffBlocked(ctx context.Context, staffRefs calendar.StaffRefs, c calendar.ExternalCalendar) (calendar.SkipReason, error) {
	st, err := staffRefs.Get(ctx, c.StaffID)
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

// planDeps は、外部の予定を読み替えるときに読む、buddy の予定の対応、利用者、繰り返しの予定、サービスコードである。
type planDeps struct {
	calendars          Calendars
	patients           calendar.Patients
	recurringSchedules kernel.Finder[scheduleview.RecurringDetail]
	serviceCodes       calendar.ServiceCodes
}

// planMode は、読み替えの規則の分かれ目である。
type planMode struct {
	// cutover は、切り替えの取り込みかである（planInput.cutover）。
	cutover bool
	// overwrite は、切り替えの取り込みで、Google で変わったか消えた予定の対応を、消して取り込み直す予定にするかである。
	// 取り込みとそのプレビューは true、完了の確認は false にする。
	overwrite bool
}

// readEvents は、カレンダー c の期間 rng の予定を src で読む。期間の中の回を期間の外へ動かした例外の回は、期間で読むと返らないので、
// 前後を広げて読み、元の日付が期間の中のものを足す。
func readEvents(ctx context.Context, src calendar.EventSource, c calendar.ExternalCalendar, rng Range) ([]calendar.Event, error) {
	events, err := src.Events(ctx, c.CalendarID, rng.TimeMin(), rng.TimeMax())
	if err != nil {
		return nil, err
	}
	wide := rng.widened()
	around, err := src.Events(ctx, c.CalendarID, wide.TimeMin(), wide.TimeMax())
	if err != nil {
		return nil, err
	}
	return withMovedExceptions(events, around, rng), nil
}

// planEvents は、カレンダー c の期間 rng の予定を src で読み、読み替えた plan と、事業所の利用者を返す。
// blocked は、カレンダーを結び付けた職員に新しい予定を作らない理由で、空でなければ新しい予定をその理由の取り込まない予定にする。
func planEvents(ctx context.Context, d planDeps, src calendar.EventSource, c calendar.ExternalCalendar, rng Range, blocked calendar.SkipReason, mode planMode) (plan, []PatientRef, error) {
	events, err := readEvents(ctx, src, c, rng)
	if err != nil {
		return plan{}, nil, err
	}
	return planRead(ctx, d, src, c, rng, events, blocked, mode)
}

// planRead は、読んだ予定 events を、buddy の予定の対応と利用者とサービスコードを読んで読み替える。
// 切り替えの取り込みでは繰り返しの予定を回に展開しないので、src を読まない。
func planRead(ctx context.Context, d planDeps, src calendar.EventSource, c calendar.ExternalCalendar, rng Range, events []calendar.Event, blocked calendar.SkipReason, mode planMode) (plan, []PatientRef, error) {
	links, err := d.calendars.ListLinks(ctx, c.ID)
	if err != nil {
		return plan{}, nil, err
	}
	var overwrite []calendar.EventLink
	if mode.cutover && mode.overwrite {
		overwrite, links = splitStale(events, links)
	}
	in := planInput{
		rng: rng, events: events, links: make(map[string]calendar.EventLink, len(links)), instances: map[string][]calendar.Event{},
		linkedRecurring: map[string]scheduleview.RecurringDetail{}, staffBlocked: blocked, staffID: c.StaffID, cutover: mode.cutover,
	}
	for _, l := range links {
		in.links[l.ExternalEventID] = l
	}
	if !mode.cutover {
		for _, id := range parentsToExpand(events, in.links) {
			instances, err := src.Instances(ctx, c.CalendarID, id, rng.TimeMin(), rng.TimeMax())
			if err != nil {
				return plan{}, nil, err
			}
			in.instances[id] = instances
		}
	}
	for _, ev := range events {
		l, ok := in.links[ev.RecurringEventID]
		if ev.RecurringEventID == "" || !ok || l.RecurringScheduleID == nil {
			continue
		}
		if _, done := in.linkedRecurring[ev.RecurringEventID]; done {
			continue
		}
		rs, err := d.recurringSchedules.Get(ctx, *l.RecurringScheduleID)
		if err != nil {
			return plan{}, nil, err
		}
		in.linkedRecurring[ev.RecurringEventID] = rs
	}
	pats, err := d.patients.ListByFacility(ctx, c.FacilityID, patient.ListQuery{Sort: kernel.Sort{Field: "name"}})
	if err != nil {
		return plan{}, nil, err
	}
	in.patients = make([]PatientRef, len(pats))
	for i, p := range pats {
		in.patients[i] = PatientRef{ID: p.ID, Name: p.Name, AssignedStaffName: p.AssignedStaffName}
	}
	if in.serviceCodes, err = d.serviceCodes.List(ctx); err != nil {
		return plan{}, nil, err
	}
	p := newPlan(in)
	p.overwrite = overwrite
	p.counts.Overwrite = len(mismatchedLinks(events, overwrite))
	return p, in.patients, nil
}
