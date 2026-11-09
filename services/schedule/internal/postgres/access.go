package postgres

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// GetIDByOrgID は、ID ブローカーの組織の ID が orgID の事業所の ID を返す。結び付いた事業所が無いときは apperr.ErrNotFound を返す。
func (r *FacilityRepository) GetIDByOrgID(ctx context.Context, orgID string) (string, error) {
	f, err := r.GetByOrgID(ctx, orgID)
	return f.ID, err
}

// GetPrincipal は、ID が id の職員の、認可に要る項目を返す。無いときは apperr.ErrNotFound を返す。
func (r *StaffRepository) GetPrincipal(ctx context.Context, id string) (principal.Staff, error) {
	d, err := r.Get(ctx, id)
	if err != nil {
		return principal.Staff{}, err
	}
	return principal.StaffOf(d), nil
}

// GetFacilityID は、ID が id の部署の事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *DepartmentRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetDepartmentFacilityID(ctx, id)
	return f, translate("get department facility", err)
}

// GetFacilityID は、ID が id のチームの事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *TeamRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetTeamFacilityID(ctx, id)
	return f, translate("get team facility", err)
}

// GetFacilityID は、ID が id の役職の事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *PositionRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetPositionFacilityID(ctx, id)
	return f, translate("get position facility", err)
}

// GetFacilityID は、ID が id の職員の事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *StaffRefRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetUserFacilityID(ctx, id)
	return f, translate("get user facility", err)
}

// GetFacilityID は、ID が id の利用者の事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *PatientRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetPatientFacilityID(ctx, id)
	return f, translate("get patient facility", err)
}

// GetFacilityID は、ID が id の予定の事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *ScheduleRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetScheduleFacilityID(ctx, id)
	return f, translate("get schedule facility", err)
}

// GetFacilityID は、ID が id の繰り返しの予定の事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *RecurringScheduleRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetRecurringScheduleFacilityID(ctx, id)
	return f, translate("get recurring schedule facility", err)
}

// GetFacilityID は、ID が id の外部のカレンダーの事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetExternalCalendarFacilityID(ctx, id)
	return f, translate("get external calendar facility", err)
}

// GetFacilityID は、ID が id の書き出しの待ちの事業所の ID を返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarExportRepository) GetFacilityID(ctx context.Context, id string) (string, error) {
	f, err := r.q(ctx).GetCalendarExportFacilityID(ctx, id)
	return f, translate("get calendar export facility", err)
}
