package schedule

import (
	"context"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// Current は、認証のミドルウェアが ctx に入れた職員を返す。入っていなければ apperr.ErrForbidden を返す。
func Current(ctx context.Context) (principal.Principal, error) {
	p, ok := principal.From(ctx)
	if !ok {
		return principal.Principal{}, fmt.Errorf("%w: 職員を特定できません", apperr.ErrForbidden)
	}
	return p, nil
}

// RequireScheduleAccess は、ctx の職員が、職員 staffID の予定を見てよいか（editing なら編集してよいか）を確認する。
// ctx に職員が無いときと、許されないときは apperr.ErrForbidden を、職員 staffID が見つからないときは refs の Get のエラー（apperr.ErrNotFound）を返す。
func RequireScheduleAccess(ctx context.Context, refs kernel.Finder[staff.Ref], staffID string, editing bool) error {
	p, err := Current(ctx)
	if err != nil {
		return err
	}
	st, err := refs.Get(ctx, staffID)
	if err != nil {
		return err
	}
	return RequireAllowed(p, st, editing)
}
