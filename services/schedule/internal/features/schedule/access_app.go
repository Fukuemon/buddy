package schedule

import (
	"context"
	"fmt"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// current は、認証のミドルウェアが ctx に入れた職員を返す。入っていなければ apperr.ErrForbidden を返す。
func current(ctx context.Context) (principal.Principal, error) {
	p, ok := principal.From(ctx)
	if !ok {
		return principal.Principal{}, fmt.Errorf("%w: 職員を特定できません", apperr.ErrForbidden)
	}
	return p, nil
}

// requireScheduleAccess は、ctx の職員が、職員 staffID の予定を見てよいか（editing なら編集してよいか）を確認する。
func (s *App) requireScheduleAccess(ctx context.Context, staffID string, editing bool) error {
	p, err := current(ctx)
	if err != nil {
		return err
	}
	st, err := s.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return err
	}
	return requireAllowed(p, st, editing)
}
