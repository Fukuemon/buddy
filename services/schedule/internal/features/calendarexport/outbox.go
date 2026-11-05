package calendarexport

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Outbox は、schedule.Exports を実装し、予定の変更を書き出しの待ちに積む。
// 積むのは、事業所が buddy を予定の正本にしていて（buddy_primary）、予定の職員が外していないカレンダーを結び付けているときと、
// 予定の対応のカレンダーを外していないとき（職員が替わり、前のカレンダーの予定を消すとき）だけである。
type Outbox struct {
	facilities kernel.Finder[organization.Facility]
	exports    ExportRepository
	calendars  ExportCalendars
	ids        kernel.IDGenerator
}

// NewOutbox は Outbox を作る。facilities は、事業所の正本のモードを読む。
func NewOutbox(facilities kernel.Finder[organization.Facility], exports ExportRepository, calendars ExportCalendars, ids kernel.IDGenerator) *Outbox {
	return &Outbox{facilities: facilities, exports: exports, calendars: calendars, ids: ids}
}

// ScheduleChanged は、単発の予定 scheduleID の変更を積む。
func (o *Outbox) ScheduleChanged(ctx context.Context, facilityID, staffID, scheduleID string) error {
	return o.enqueue(ctx, staffID, calendar.Target{FacilityID: facilityID, ScheduleID: scheduleID}, func(ctx context.Context) (calendar.EventLink, error) {
		return o.calendars.LinkBySchedule(ctx, scheduleID)
	})
}

// RecurringChanged は、繰り返しの予定 recurringScheduleID の変更を積む。
func (o *Outbox) RecurringChanged(ctx context.Context, facilityID, staffID, recurringScheduleID string) error {
	return o.enqueue(ctx, staffID, calendar.Target{FacilityID: facilityID, RecurringScheduleID: recurringScheduleID}, func(ctx context.Context) (calendar.EventLink, error) {
		return o.calendars.LinkByRecurringSchedule(ctx, recurringScheduleID)
	})
}

func (o *Outbox) enqueue(ctx context.Context, staffID string, t calendar.Target, linkOf func(context.Context) (calendar.EventLink, error)) error {
	// google_primary の事業所は Google カレンダーが正本なので、buddy から書き出さない（ADR-0026）。
	f, err := o.facilities.Get(ctx, t.FacilityID)
	if err != nil || !f.IsBuddyPrimary() {
		return err
	}
	ok, err := o.writable(ctx, staffID, linkOf)
	if err != nil || !ok {
		return err
	}
	return o.exports.Enqueue(ctx, o.ids.NewID(), t)
}

// writable は、職員 staffID の予定の変更を書く先のカレンダーがあるかを返す。linkOf は予定の対応を読む。
func (o *Outbox) writable(ctx context.Context, staffID string, linkOf func(context.Context) (calendar.EventLink, error)) (bool, error) {
	_, err := o.calendars.ActiveByStaff(ctx, staffID)
	if err == nil {
		return true, nil
	}
	if !errors.Is(err, apperr.ErrNotFound) {
		return false, err
	}
	l, err := linkOf(ctx)
	if errors.Is(err, apperr.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	c, err := o.calendars.Get(ctx, l.ExternalCalendarID)
	if err != nil {
		return false, err
	}
	return c.DisabledAt == nil, nil
}
