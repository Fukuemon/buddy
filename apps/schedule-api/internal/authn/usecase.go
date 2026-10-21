// Package authn は、検証したトークンから職員を特定する手順と、パスの ID が指すリソースが属する事業所を引く手順を持つ。
package authn

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/kernel"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/principal"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
)

// Facilities は、組織に結び付けた事業所を読む。見つからないときは apperr.ErrNotFound を返す。
type Facilities interface {
	GetByOrgID(ctx context.Context, orgID string) (organization.Facility, error)
}

// Staff は、トークンの sub から職員を探し、初回のログインで sub を結び付ける。各メソッドの約束は staff.Repository と同じである。
type Staff interface {
	FindIDBySub(ctx context.Context, sub string) (string, error)
	LinkSub(ctx context.Context, facilityID, email, sub string) error
	Get(ctx context.Context, id string) (staff.Detail, error)
}

// Deps は、Usecase が使う、ほかの機能のデータを読む小さなインターフェイスである。
type Deps struct {
	Facilities  Facilities
	Departments kernel.Finder[organization.Department]
	Teams       kernel.Finder[organization.Team]
	Positions   kernel.Finder[organization.Position]
	Staff       Staff
	StaffRefs   kernel.Finder[staff.Ref]
	Schedules   kernel.Finder[schedule.Detail]
	Recurring   kernel.Finder[schedule.RecurringDetail]
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
)

// Usecase は、検証したトークンから職員を特定する操作である。
type Usecase struct {
	deps Deps
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps) *Usecase {
	return &Usecase{deps: deps}
}

// Authenticate は、id の組織に結び付けた事業所の職員を返す。
// sub で職員を探し、いなければ、メールが確認済みのときに限り、その事業所の同じメールで sub がまだない職員に sub を結び付ける。
// 組織がないか事業所に結び付いていないとき、職員が見つからないとき、職員の事業所が組織の事業所と違うときは
// apperr.ErrForbidden を返す。
func (a *Usecase) Authenticate(ctx context.Context, id principal.Identity) (principal.Principal, error) {
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
		staffID, err = a.link(ctx, f.ID, id)
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
	return principal.Principal{Staff: d}, nil
}

// link は、初回のログインの職員に sub を書き、職員の ID を返す。同じ sub の要求が同時に来ても、
// LinkSub は 1 回だけ書くので、書いた後に sub で探し直す。
func (a *Usecase) link(ctx context.Context, facilityID string, id principal.Identity) (string, error) {
	if !id.EmailVerified || id.Email == "" {
		return "", fmt.Errorf("%w: 確認済みのメールがありません", apperr.ErrForbidden)
	}
	if err := a.deps.Staff.LinkSub(ctx, facilityID, id.Email, id.Subject); err != nil && !errors.Is(err, apperr.ErrConflict) {
		return "", err
	}
	staffID, err := a.deps.Staff.FindIDBySub(ctx, id.Subject)
	if errors.Is(err, apperr.ErrNotFound) {
		return "", fmt.Errorf("%w: 登録された職員がいません", apperr.ErrForbidden)
	}
	return staffID, err
}

// FacilityOf は、種類 r の ID が id のリソースが属する事業所の ID を返す。ResourceFacility なら id をそのまま返す。
// リソースが見つからないときは apperr.ErrNotFound を返す。
func (a *Usecase) FacilityOf(ctx context.Context, r Resource, id string) (string, error) {
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
	default:
		return "", fmt.Errorf("事業所を求められないリソースの種類 %d です", r)
	}
}
