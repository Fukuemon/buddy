package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// requireAssignable は、職員 staffID が事業所 facilityID にいて、担当を新しく割り振れるかを確認する。
// 見つからないか別の事業所の職員か、休職か退職の職員なら入力のエラーを返す。
func (p *App) requireAssignable(ctx context.Context, staffID, facilityID string) error {
	st, err := p.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return apperr.Reference("職員", staffID, err)
	}
	if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
		return err
	}
	return st.RequireAssignable()
}
