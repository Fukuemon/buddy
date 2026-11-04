package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// ServiceCodeRepository は、servicecode.Repository を実装する。
type ServiceCodeRepository struct{ conn }

// NewServiceCodeRepository は ServiceCodeRepository を作る。
func NewServiceCodeRepository(pool *pgxpool.Pool) *ServiceCodeRepository {
	return &ServiceCodeRepository{conn{pool}}
}

// Get は、ID が id のサービスコードを返す。無いときは apperr.ErrNotFound を返す。
func (r *ServiceCodeRepository) Get(ctx context.Context, id string) (servicecode.ServiceCode, error) {
	c, err := r.q(ctx).GetServiceCode(ctx, id)
	if err != nil {
		return servicecode.ServiceCode{}, translate("get service code", err)
	}
	return serviceCode(c), nil
}

// List は、すべてのサービスコードをコード、ID の順に返す。
func (r *ServiceCodeRepository) List(ctx context.Context) ([]servicecode.ServiceCode, error) {
	rows, err := r.q(ctx).ListServiceCodes(ctx)
	if err != nil {
		return nil, translate("list service codes", err)
	}
	out := make([]servicecode.ServiceCode, len(rows))
	for i, c := range rows {
		out[i] = serviceCode(c)
	}
	return out, nil
}

func serviceCode(c sqlcgen.ServiceCode) servicecode.ServiceCode {
	return servicecode.ServiceCode{
		ID: c.ID, Code: c.Code,
		StartMinutes: int(c.ServiceTimeRangeStart), EndMinutes: int(c.ServiceTimeRangeEnd),
	}
}
