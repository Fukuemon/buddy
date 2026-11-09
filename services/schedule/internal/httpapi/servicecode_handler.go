package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
)

func toServiceCode(s servicecode.ServiceCode) openapi.ServiceCode {
	return openapi.ServiceCode{Id: s.ID, Code: s.Code, ServiceTimeRangeStart: s.StartMinutes, ServiceTimeRangeEnd: s.EndMinutes}
}

func (s server) ListServiceCodes(ctx context.Context, _ openapi.ListServiceCodesRequestObject) (openapi.ListServiceCodesResponseObject, error) {
	cs, err := s.u.ServiceCodes.List(ctx)
	if err != nil {
		return nil, err
	}
	return openapi.ListServiceCodes200JSONResponse(mapSlice(cs, toServiceCode)), nil
}
