package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Preview は、カレンダー id の期間 rng の予定を読み、取り込むとどうなるかを返す。
type Preview struct {
	calendars          Calendars
	accounts           calendar.Accounts
	staff              calendar.StaffRefs
	patients           calendar.Patients
	recurringSchedules kernel.Finder[scheduleview.RecurringDetail]
	serviceCodes       calendar.ServiceCodes
	cutovers           CutoverRepository
	guard              kernel.Guard
}

// NewPreview は Preview を作る。
func NewPreview(calendars Calendars, accounts calendar.Accounts, staff calendar.StaffRefs, patients calendar.Patients, recurringSchedules kernel.Finder[scheduleview.RecurringDetail], serviceCodes calendar.ServiceCodes, cutovers CutoverRepository, guard kernel.Guard) Preview {
	return Preview{calendars: calendars, accounts: accounts, staff: staff, patients: patients, recurringSchedules: recurringSchedules, serviceCodes: serviceCodes, cutovers: cutovers, guard: guard}
}

// Do は、カレンダー id の期間 rng の予定を読み、取り込むとどうなるかを返す。予定は書かない。
// 職員が休職か訪問しない職員なら、新しい予定を SkipStaffOnLeave か SkipStaffNonVisiting の取り込まない予定にする。
// 事業所に open の切り替えがあれば、切り替えの取り込みの規則で読み替える。期間は切り替えの期間でなければならない（requireCutoverRange）。
// カレンダーが無いか外したとき、職員が退職したときは apperr.ErrNotFound を、読めないときは calendar.ErrUnreadable か calendar.ErrUnavailable か calendar.ErrNotConfigured を返す。
func (u Preview) Do(ctx context.Context, id string, rng Range) (ImportPreview, error) {
	if err := u.guard(ctx); err != nil {
		return ImportPreview{}, err
	}
	c, err := calendar.Active(ctx, u.calendars, id)
	if err != nil {
		return ImportPreview{}, err
	}
	open, err := findOpen(ctx, u.cutovers, c.FacilityID)
	if err != nil {
		return ImportPreview{}, err
	}
	if err := requireCutoverRange(rng, open); err != nil {
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
	d := planDeps{calendars: u.calendars, patients: u.patients, recurringSchedules: u.recurringSchedules, serviceCodes: u.serviceCodes, records: u.cutovers}
	p, _, err := planEvents(ctx, d, src, c, rng, blocked, planMode{cutover: open != nil, overwrite: true})
	if err != nil {
		return ImportPreview{}, err
	}
	return ImportPreview{Range: rng, Counts: p.counts, ReviewItems: p.reviewItems, SkippedItems: p.skippedItems}, nil
}
