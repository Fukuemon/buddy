package httpapi

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
)

// PatientUsecase は、利用者のハンドラが使う操作である。
type PatientUsecase interface {
	Create(ctx context.Context, in patient.CreateInput) (patient.Detail, error)
	Update(ctx context.Context, id string, in patient.UpdateInput) (patient.Detail, error)
	End(ctx context.Context, id string) (patient.Detail, error)
	RemainingSchedules(ctx context.Context, id string) (patient.Remaining, error)
	Resume(ctx context.Context, id, assignedStaffID string) (patient.Detail, error)
	Get(ctx context.Context, id string) (patient.Detail, error)
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
		EndedAt:           p.EndedAt,
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
		IncludeEnded:  p.IncludeEnded != nil && *p.IncludeEnded,
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

// GetPatient は、利用中か利用の終了の利用者を 1 人返す。
func (s server) GetPatient(ctx context.Context, req openapi.GetPatientRequestObject) (openapi.GetPatientResponseObject, error) {
	p, err := s.u.Patients.Get(ctx, req.PatientId)
	if err != nil {
		return nil, err
	}
	return openapi.GetPatient200JSONResponse(toPatient(p)), nil
}

// GetPatientRemainingSchedules は、利用者の今日以降に残る予定と繰り返しの予定を、利用の終了の 409 と同じ形で返す。
func (s server) GetPatientRemainingSchedules(ctx context.Context, req openapi.GetPatientRemainingSchedulesRequestObject) (openapi.GetPatientRemainingSchedulesResponseObject, error) {
	r, err := s.u.Patients.RemainingSchedules(ctx, req.PatientId)
	if err != nil {
		return nil, err
	}
	return openapi.GetPatientRemainingSchedules200JSONResponse(toPatientSchedules(r)), nil
}

// UpdatePatient は、利用者の名前、希望、サービスコード、担当の職員を変え、変えた利用者を返す。
func (s server) UpdatePatient(ctx context.Context, req openapi.UpdatePatientRequestObject) (openapi.UpdatePatientResponseObject, error) {
	b := req.Body
	p, err := s.u.Patients.Update(ctx, req.PatientId, patient.UpdateInput{
		Name:            b.Name,
		PreferredTime:   patient.PreferredTime(b.PreferredTime),
		PreferredGender: patient.PreferredGender(b.PreferredGender),
		ServiceCodeID:   b.ServiceCodeId,
		AssignedStaffID: b.AssignedStaffId,
	})
	if err != nil {
		return nil, err
	}
	return openapi.UpdatePatient200JSONResponse(toPatient(p)), nil
}

// EndPatientService は、利用者を利用の終了にし、利用の終了にした利用者を返す。その日以降の予定が残るときは、残る一覧を付けた 409 を返す。
func (s server) EndPatientService(ctx context.Context, req openapi.EndPatientServiceRequestObject) (openapi.EndPatientServiceResponseObject, error) {
	p, err := s.u.Patients.End(ctx, req.PatientId)
	if se, ok := errors.AsType[*patient.ScheduledError](err); ok {
		r := toPatientSchedules(se.Remaining)
		return openapi.EndPatientService409JSONResponse{Code: "patient_has_schedules", Message: se.Error(), Schedules: &r}, nil
	}
	if err != nil {
		return nil, err
	}
	return openapi.EndPatientService200JSONResponse(toPatient(p)), nil
}

// ResumePatientService は、利用者を利用中に戻して担当の職員を書き換え、戻した利用者を返す。
func (s server) ResumePatientService(ctx context.Context, req openapi.ResumePatientServiceRequestObject) (openapi.ResumePatientServiceResponseObject, error) {
	p, err := s.u.Patients.Resume(ctx, req.PatientId, req.Body.AssignedStaffId)
	if err != nil {
		return nil, err
	}
	return openapi.ResumePatientService200JSONResponse(toPatient(p)), nil
}

func toPatientSchedules(r patient.Remaining) openapi.PatientSchedules {
	return openapi.PatientSchedules{
		Schedules: mapSlice(r.Schedules, func(s patient.RemainingSchedule) openapi.PatientSchedules_Schedules {
			return openapi.PatientSchedules_Schedules{Id: s.ID, Date: s.Date.String(), StartTime: s.StartTime.String(), EndTime: s.EndTime.String()}
		}),
		RecurringSchedules: mapSlice(r.Recurring, func(r patient.RemainingRecurring) openapi.PatientSchedules_RecurringSchedules {
			return openapi.PatientSchedules_RecurringSchedules{
				Id: r.ID, Date: r.Date.String(), EndDate: stringPtr(r.EndDate), StartTime: r.StartTime.String(), EndTime: r.EndTime.String(),
			}
		}),
	}
}
