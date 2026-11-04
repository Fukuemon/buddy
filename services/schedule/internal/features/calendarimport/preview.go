package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Preview は、カレンダー id の期間 rng の予定を読み、取り込むとどうなるかを返す。
type Preview struct {
	calendars          Calendars
	accounts           calendar.Accounts
	staff              calendar.StaffRefs
	patients           calendar.Patients
	recurringSchedules kernel.Finder[schedule.RecurringDetail]
	serviceCodes       calendar.ServiceCodes
	guard              organization.Guard
}

// NewPreview は Preview を作る。
func NewPreview(calendars Calendars, accounts calendar.Accounts, staff calendar.StaffRefs, patients calendar.Patients, recurringSchedules kernel.Finder[schedule.RecurringDetail], serviceCodes calendar.ServiceCodes, guard organization.Guard) Preview {
	return Preview{calendars: calendars, accounts: accounts, staff: staff, patients: patients, recurringSchedules: recurringSchedules, serviceCodes: serviceCodes, guard: guard}
}

// Do は、カレンダー id の期間 rng の予定を読み、取り込むとどうなるかを返す。予定は書かない。
// 職員が休職か訪問しない職員なら、新しい予定を SkipStaffOnLeave か SkipStaffNonVisiting の取り込まない予定にする。
// カレンダーが無いか外したとき、職員が退職したときは apperr.ErrNotFound を、読めないときは calendar.ErrUnreadable か calendar.ErrUnavailable か calendar.ErrNotConfigured を返す。
func (u Preview) Do(ctx context.Context, id string, rng Range) (ImportPreview, error) {
	if err := u.guard(ctx); err != nil {
		return ImportPreview{}, err
	}
	c, err := calendar.Active(ctx, u.calendars, id)
	if err != nil {
		return ImportPreview{}, err
	}
	src, err := calendar.Source(ctx, u.accounts, c.FacilityID)
	if err != nil {
		return ImportPreview{}, err
	}
	blocked, err := staffBlocked(ctx, u.staff, c)
	if err != nil {
		return ImportPreview{}, err
	}
	p, _, err := planEvents(ctx, u.calendars, u.patients, u.recurringSchedules, u.serviceCodes, src, c, rng, blocked)
	if err != nil {
		return ImportPreview{}, err
	}
	return ImportPreview{Range: rng, Counts: p.counts, ReviewItems: p.reviewItems, SkippedItems: p.skippedItems}, nil
}
