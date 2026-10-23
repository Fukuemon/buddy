// Package access は、検証したトークンから職員を特定する手順と、パスの ID が指すリソースが属する事業所を引く手順を持つ。
package access

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
)

// Facilities は、組織に結び付けた事業所を読む。見つからないときは apperr.ErrNotFound を返す。
type Facilities interface {
	GetByOrgID(ctx context.Context, orgID string) (organization.Facility, error)
}

// Staff は、トークンの sub から職員を探す。各メソッドの約束は staff.Repository と同じである。
type Staff interface {
	FindIDBySub(ctx context.Context, sub string) (string, error)
	Get(ctx context.Context, id string) (staff.Detail, error)
}

// Deps は、Service が使う、ほかの機能のデータを読む小さなインターフェイスである。
type Deps struct {
	Facilities  Facilities
	Departments kernel.Finder[organization.Department]
	Teams       kernel.Finder[organization.Team]
	Positions   kernel.Finder[organization.Position]
	Staff       Staff
	StaffRefs   kernel.Finder[staff.Ref]
	Schedules   kernel.Finder[schedule.Detail]
	Recurring   kernel.Finder[schedule.RecurringDetail]
	Calendars   kernel.Finder[calendar.ExternalCalendar]
	Exports     kernel.Finder[calendar.Export]
}

// Resource は、パスの ID が指すリソースの種類である。
type Resource int

// FacilityOf が事業所を求められるリソース。
const (
	ResourceFacility Resource = iota + 1
	ResourceDepartment
	ResourceTeam
	ResourcePosition
	ResourceStaff
	ResourceSchedule
	ResourceRecurringSchedule
	ResourceExternalCalendar
	ResourceCalendarExport
)

// Service は、検証したトークンから職員を特定する操作である。
type Service struct {
	deps Deps
}

// NewService は Service を作る。
func NewService(deps Deps) *Service {
	return &Service{deps: deps}
}

// Authenticate は、id の組織に結び付けた事業所の職員を返す。職員は sub（ブローカーの職員の ID）で探す（ADR-0017）。
// 組織がないか事業所に結び付いていないとき、職員が見つからないとき、職員の事業所が組織の事業所と違うとき、
// 職員が休職か退職しているときは apperr.ErrForbidden を返す。休職と退職の職員は、手元の access token の期限が切れる前でも拒む。
func (a *Service) Authenticate(ctx context.Context, id principal.Identity) (principal.Principal, error) {
	if id.OrgID == "" {
		return principal.Principal{}, fmt.Errorf("%w: トークンに組織がありません", apperr.ErrForbidden)
	}
	f, err := a.deps.Facilities.GetByOrgID(ctx, id.OrgID)
	if errors.Is(err, apperr.ErrNotFound) {
		return principal.Principal{}, fmt.Errorf("%w: 組織に結び付いた事業所がありません", apperr.ErrForbidden)
	}
	if err != nil {
		return principal.Principal{}, err
	}
	staffID, err := a.deps.Staff.FindIDBySub(ctx, id.Subject)
	if errors.Is(err, apperr.ErrNotFound) {
		return principal.Principal{}, fmt.Errorf("%w: 登録された職員がいません", apperr.ErrForbidden)
	}
	if err != nil {
		return principal.Principal{}, err
	}
	d, err := a.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return principal.Principal{}, err
	}
	if d.FacilityID != f.ID {
		return principal.Principal{}, fmt.Errorf("%w: 職員の事業所が組織の事業所と違います", apperr.ErrForbidden)
	}
	if d.Status() != staff.StatusActive {
		return principal.Principal{}, fmt.Errorf("%w: 職員は休職か退職しています", apperr.ErrForbidden)
	}
	return principal.Principal{Staff: d}, nil
}

// FacilityOf は、種類 r の ID が id のリソースが属する事業所の ID を返す。ResourceFacility なら id をそのまま返す。
// リソースが見つからないときは apperr.ErrNotFound を返す。
func (a *Service) FacilityOf(ctx context.Context, r Resource, id string) (string, error) {
	switch r {
	case ResourceFacility:
		return id, nil
	case ResourceDepartment:
		d, err := a.deps.Departments.Get(ctx, id)
		return d.FacilityID, err
	case ResourceTeam:
		t, err := a.deps.Teams.Get(ctx, id)
		return t.FacilityID, err
	case ResourcePosition:
		p, err := a.deps.Positions.Get(ctx, id)
		return p.FacilityID, err
	case ResourceStaff:
		s, err := a.deps.StaffRefs.Get(ctx, id)
		return s.FacilityID, err
	case ResourceSchedule:
		s, err := a.deps.Schedules.Get(ctx, id)
		return s.FacilityID, err
	case ResourceRecurringSchedule:
		s, err := a.deps.Recurring.Get(ctx, id)
		return s.FacilityID, err
	case ResourceExternalCalendar:
		c, err := a.deps.Calendars.Get(ctx, id)
		return c.FacilityID, err
	case ResourceCalendarExport:
		e, err := a.deps.Exports.Get(ctx, id)
		return e.FacilityID, err
	default:
		return "", fmt.Errorf("事業所を求められないリソースの種類 %d です", r)
	}
}
