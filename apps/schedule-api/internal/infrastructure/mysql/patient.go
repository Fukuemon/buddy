package mysql

import (
	"context"
	"database/sql"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/mysql/sqlcgen"
)

// PatientRepository は、patient.Repository を実装する。
type PatientRepository struct{ conn }

// NewPatientRepository は PatientRepository を作る。
func NewPatientRepository(db *sql.DB) *PatientRepository { return &PatientRepository{conn{db}} }

func (r *PatientRepository) Create(ctx context.Context, p patient.Patient) error {
	err := r.q(ctx).CreatePatient(ctx, sqlcgen.CreatePatientParams{
		ID:              p.ID,
		FacilityID:      p.FacilityID,
		Name:            p.Name,
		PreferredTime:   string(p.PreferredTime),
		PreferredGender: string(p.PreferredGender),
		ServiceCodeID:   p.ServiceCodeID,
		AssignedStaffID: p.AssignedStaffID,
	})
	return translate("create patient", err)
}

func (r *PatientRepository) Get(ctx context.Context, id string) (patient.Detail, error) {
	row, err := r.q(ctx).GetPatient(ctx, id)
	if err != nil {
		return patient.Detail{}, translate("get patient", err)
	}
	return patientDetail(sqlcgen.ListPatientsByFacilityRow(row)), nil
}

func (r *PatientRepository) ListByFacility(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error) {
	params := sqlcgen.ListPatientsByFacilityParams{
		FacilityID:    facilityID,
		Name:          nullString(q.Name),
		AssignedStaff: nullString(q.AssignedStaff),
		Sort:          q.Sort.Key(),
	}
	if q.PreferredTime != nil {
		params.PreferredTime = sql.NullString{String: string(*q.PreferredTime), Valid: true}
	}
	if q.PreferredGender != nil {
		params.PreferredGender = sql.NullString{String: string(*q.PreferredGender), Valid: true}
	}
	rows, err := r.q(ctx).ListPatientsByFacility(ctx, params)
	if err != nil {
		return nil, translate("list patients", err)
	}
	out := make([]patient.Detail, len(rows))
	for i, row := range rows {
		out[i] = patientDetail(row)
	}
	return out, nil
}

func patientDetail(row sqlcgen.ListPatientsByFacilityRow) patient.Detail {
	return patient.Detail{
		Patient: patient.Patient{
			ID:              row.ID,
			FacilityID:      row.FacilityID,
			Name:            row.Name,
			PreferredTime:   patient.PreferredTime(row.PreferredTime),
			PreferredGender: patient.PreferredGender(row.PreferredGender),
			ServiceCodeID:   row.ServiceCodeID,
			AssignedStaffID: row.AssignedStaffID,
		},
		ServiceCode:       row.ServiceCode,
		AssignedStaffName: row.AssignedStaffName,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}
