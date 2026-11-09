package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
)

func toVisitCategory(c visit.Category) openapi.VisitCategory {
	return openapi.VisitCategory{Id: c.ID, Name: c.Name}
}

func (s server) ListVisitCategories(ctx context.Context, _ openapi.ListVisitCategoriesRequestObject) (openapi.ListVisitCategoriesResponseObject, error) {
	cs, err := s.u.VisitCategories.List(ctx)
	if err != nil {
		return nil, err
	}
	return openapi.ListVisitCategories200JSONResponse(mapSlice(cs, toVisitCategory)), nil
}
