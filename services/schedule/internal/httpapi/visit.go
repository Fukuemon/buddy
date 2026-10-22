package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

// VisitMasterUsecase は、訪問の情報のマスタのハンドラが使う操作である。
type VisitMasterUsecase interface {
	ListServiceCodes(ctx context.Context) ([]visit.ServiceCode, error)
	ListCategories(ctx context.Context) ([]visit.Category, error)
}

func toServiceCode(s visit.ServiceCode) openapi.ServiceCode {
	return openapi.ServiceCode{Id: s.ID, Code: s.Code, ServiceTimeRangeStart: s.StartMinutes, ServiceTimeRangeEnd: s.EndMinutes}
}

func toVisitCategory(c visit.Category) openapi.VisitCategory {
	return openapi.VisitCategory{Id: c.ID, Name: c.Name}
}

func (s server) ListServiceCodes(ctx context.Context, _ openapi.ListServiceCodesRequestObject) (openapi.ListServiceCodesResponseObject, error) {
	cs, err := s.u.VisitMasters.ListServiceCodes(ctx)
	if err != nil {
		return nil, err
	}
	return openapi.ListServiceCodes200JSONResponse(mapSlice(cs, toServiceCode)), nil
}

func (s server) ListVisitCategories(ctx context.Context, _ openapi.ListVisitCategoriesRequestObject) (openapi.ListVisitCategoriesResponseObject, error) {
	cs, err := s.u.VisitMasters.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	return openapi.ListVisitCategories200JSONResponse(mapSlice(cs, toVisitCategory)), nil
}
