package patient

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// VisitFinder は、訪問の情報が参照する利用者を r から探す visit.PatientFinder を返す。
func VisitFinder(r Getter) visit.PatientFinder {
	return func(ctx context.Context, id string) (visit.PatientRef, error) {
		p, err := r.Get(ctx, id)
		if err != nil {
			return visit.PatientRef{}, err
		}
		return visit.PatientRef{ID: p.ID, FacilityID: p.FacilityID, Ended: p.IsEnded()}, nil
	}
}

// ServiceCodes は、利用者のデフォルトのサービスコードを確認する。見つからないときは apperr.ErrNotFound を返す。
type ServiceCodes interface {
	GetServiceCode(ctx context.Context, id string) (visit.ServiceCode, error)
}
