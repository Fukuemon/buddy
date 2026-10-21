package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
)

// PatientUsecase は、利用者のハンドラが使う操作である。
type PatientUsecase interface {
	Create(ctx context.Context, in patient.CreateInput) (patient.Detail, error)
	List(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error)
}

func toPatient(p patient.Detail) openapi.Patient {
	return openapi.Patient{
		Id:                p.ID,
		FacilityId:        p.FacilityID,
		Name:              p.Name,
		PreferredTime:     openapi.PreferredTime(p.PreferredTime),
		PreferredGender:   openapi.PreferredGender(p.PreferredGender),
		ServiceCodeId:     p.ServiceCodeID,
		ServiceCode:       p.ServiceCode,
		AssignedStaffId:   p.AssignedStaffID,
		AssignedStaffName: p.AssignedStaffName,
		CreatedAt:         p.CreatedAt,
		UpdatedAt:         p.UpdatedAt,
	}
}

func (s server) ListPatients(ctx context.Context, req openapi.ListPatientsRequestObject) (openapi.ListPatientsResponseObject, error) {
	p := req.Params
	sort, err := patient.ParseSort(value(p.SortField), value(p.SortOrder))
	if err != nil {
		return nil, err
	}
	q := patient.ListQuery{
		Name:          nonEmpty(p.Name),
		AssignedStaff: nonEmpty(p.AssignedStaff),
		Sort:          sort,
	}
	if v := value(p.PreferredTime); v != "" {
		t := patient.PreferredTime(v)
		if !t.Valid() {
			return nil, invalidRequest("preferred_time は 午前 か 午後 です")
		}
		q.PreferredTime = &t
	}
	if v := value(p.PreferredGender); v != "" {
		g := patient.PreferredGender(v)
		if !g.Valid() {
			return nil, invalidRequest("preferred_gender は 男性 か 女性 です")
		}
		q.PreferredGender = &g
	}
	ps, err := s.u.Patients.List(ctx, req.FacilityId, q)
	if err != nil {
		return nil, err
	}
	return openapi.ListPatients200JSONResponse(mapSlice(ps, toPatient)), nil
}

func (s server) CreatePatient(ctx context.Context, req openapi.CreatePatientRequestObject) (openapi.CreatePatientResponseObject, error) {
	b := req.Body
	p, err := s.u.Patients.Create(ctx, patient.CreateInput{
		FacilityID:      req.FacilityId,
		Name:            b.Name,
		PreferredTime:   patient.PreferredTime(b.PreferredTime),
		PreferredGender: patient.PreferredGender(b.PreferredGender),
		ServiceCodeID:   b.ServiceCodeId,
		AssignedStaffID: b.AssignedStaffId,
	})
	if err != nil {
		return nil, err
	}
	return openapi.CreatePatient201JSONResponse(toPatient(p)), nil
}
