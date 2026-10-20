package usecase

import (
	"context"
	"errors"
	"fmt"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
)

// AuthRepositories は、Auth が使うリポジトリである。
type AuthRepositories struct {
	Facilities organization.FacilityRepository
	Staff      staff.Repository
}

// Auth は、検証したトークンから職員を特定する操作である。
type Auth struct {
	repos AuthRepositories
}

// NewAuth は Auth を作る。
func NewAuth(repos AuthRepositories) *Auth {
	return &Auth{repos: repos}
}

// Authenticate は、id の組織に結び付けた事業所の職員を返す。
// sub で職員を探し、いなければ、メールが確認済みのときに限り、その事業所の同じメールで sub がまだない職員に sub を結び付ける。
// 組織がないか事業所に結び付いていないとき、職員が見つからないとき、職員の事業所が組織の事業所と違うときは
// domain.ErrForbidden を返す。
func (a *Auth) Authenticate(ctx context.Context, id auth.Identity) (auth.Principal, error) {
	if id.OrgID == "" {
		return auth.Principal{}, fmt.Errorf("%w: トークンに組織がありません", domain.ErrForbidden)
	}
	f, err := a.repos.Facilities.GetByOrgID(ctx, id.OrgID)
	if errors.Is(err, domain.ErrNotFound) {
		return auth.Principal{}, fmt.Errorf("%w: 組織に結び付いた事業所がありません", domain.ErrForbidden)
	}
	if err != nil {
		return auth.Principal{}, err
	}
	staffID, err := a.repos.Staff.FindIDBySub(ctx, id.Subject)
	if errors.Is(err, domain.ErrNotFound) {
		staffID, err = a.link(ctx, f.ID, id)
	}
	if err != nil {
		return auth.Principal{}, err
	}
	d, err := a.repos.Staff.Get(ctx, staffID)
	if err != nil {
		return auth.Principal{}, err
	}
	if d.FacilityID != f.ID {
		return auth.Principal{}, fmt.Errorf("%w: 職員の事業所が組織の事業所と違います", domain.ErrForbidden)
	}
	return auth.Principal{Staff: d}, nil
}

// link は、初回のログインの職員に sub を書き、職員の ID を返す。同じ sub の要求が同時に来ても、
// LinkSub は 1 回だけ書くので、書いた後に sub で探し直す。
func (a *Auth) link(ctx context.Context, facilityID string, id auth.Identity) (string, error) {
	if !id.EmailVerified || id.Email == "" {
		return "", fmt.Errorf("%w: 確認済みのメールがありません", domain.ErrForbidden)
	}
	if err := a.repos.Staff.LinkSub(ctx, facilityID, id.Email, id.Subject); err != nil && !errors.Is(err, domain.ErrConflict) {
		return "", err
	}
	staffID, err := a.repos.Staff.FindIDBySub(ctx, id.Subject)
	if errors.Is(err, domain.ErrNotFound) {
		return "", fmt.Errorf("%w: 登録された職員がいません", domain.ErrForbidden)
	}
	return staffID, err
}
