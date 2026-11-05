// Package access は、検証したトークンから職員を特定する手順と、パスの ID が指すリソースが属する事業所を引く手順を持つ。
// 機能のパッケージを import せず、ほかの機能のデータは、事業所と職員の認可に要る項目だけを小さなインターフェースで読む。
package access

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// Facilities は、組織に結び付けた事業所の ID を読む。見つからないときは apperr.ErrNotFound を返す。
type Facilities interface {
	GetIDByOrgID(ctx context.Context, orgID string) (string, error)
}

// Staff は、トークンの sub から職員を探し、認可に要る項目を読む。見つからないときは apperr.ErrNotFound を返す。
type Staff interface {
	FindIDBySub(ctx context.Context, sub string) (string, error)
	GetPrincipal(ctx context.Context, id string) (principal.Staff, error)
}

// FacilityReader は、ID が id のリソースが属する事業所の ID を読む。見つからないときは apperr.ErrNotFound を返す。
type FacilityReader interface {
	GetFacilityID(ctx context.Context, id string) (string, error)
}

// Deps は、Service が使う、ほかの機能のデータを読む小さなインターフェースである。
// Resources は、ResourceFacility を除くリソースの種類ごとに、事業所を読むものを持つ。
type Deps struct {
	Facilities Facilities
	Staff      Staff
	Resources  map[Resource]FacilityReader
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
	ResourcePatient
	ResourceCalendarCutover
)

// Service は、検証したトークンから職員を特定する操作である。
type Service struct {
	deps Deps
}

// NewService は Service を作る。
func NewService(deps Deps) *Service {
	return &Service{deps: deps}
}

// Authenticate は、id の組織に結び付けた事業所の職員を返す。職員は sub（ブローカーの職員の ID）で探す（ADR-0016）。
// 組織がないか事業所に結び付いていないとき、職員が見つからないとき、職員の事業所が組織の事業所と違うとき、
// 職員が休職か退職しているときは apperr.ErrForbidden を返す。休職と退職の職員は、手元の access token の期限が切れる前でも拒む。
func (a *Service) Authenticate(ctx context.Context, id principal.Identity) (principal.Principal, error) {
	if id.OrgID == "" {
		return principal.Principal{}, fmt.Errorf("%w: トークンに組織がありません", apperr.ErrForbidden)
	}
	facilityID, err := a.deps.Facilities.GetIDByOrgID(ctx, id.OrgID)
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
	s, err := a.deps.Staff.GetPrincipal(ctx, staffID)
	if err != nil {
		return principal.Principal{}, err
	}
	if s.FacilityID != facilityID {
		return principal.Principal{}, fmt.Errorf("%w: 職員の事業所が組織の事業所と違います", apperr.ErrForbidden)
	}
	if !s.IsActive() {
		return principal.Principal{}, fmt.Errorf("%w: 職員は休職か退職しています", apperr.ErrForbidden)
	}
	return principal.Principal{Staff: s}, nil
}

// FacilityOf は、種類 r の ID が id のリソースが属する事業所の ID を返す。ResourceFacility なら id をそのまま返す。
// リソースが見つからないときは apperr.ErrNotFound を返す。Deps.Resources に r が無いときはエラーを返す。
func (a *Service) FacilityOf(ctx context.Context, r Resource, id string) (string, error) {
	if r == ResourceFacility {
		return id, nil
	}
	reader, ok := a.deps.Resources[r]
	if !ok {
		return "", fmt.Errorf("事業所を求められないリソースの種類 %d です", r)
	}
	return reader.GetFacilityID(ctx, id)
}
