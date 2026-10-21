package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/postgres/sqlcgen"
)

// PatientRepository は、patient.Repository を実装する。
type PatientRepository struct{ conn }

// NewPatientRepository は PatientRepository を作る。
func NewPatientRepository(pool *pgxpool.Pool) *PatientRepository {
	return &PatientRepository{conn{pool}}
}

// Create は、利用者を書く。事業所、サービスコード、担当の職員のいずれかが無いか、値が列の制約（希望の時間帯と性別の値など）に合わないときは apperr.ErrInvalidInput のエラーを返す。
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

// Get は、ID が id の利用者を、サービスコードと担当の職員の名前を付けて返す。無いときは apperr.ErrNotFound を返す。
func (r *PatientRepository) Get(ctx context.Context, id string) (patient.Detail, error) {
	row, err := r.q(ctx).GetPatient(ctx, id)
	if err != nil {
		return patient.Detail{}, translate("get patient", err)
	}
	return patientDetail(sqlcgen.ListPatientsByFacilityRow(row)), nil
}

// ListByFacility は、事業所 facilityID の利用者のうち q の条件にすべて合うものを、q.Sort の順（同じ値は ID の順）に返す。
// 名前と担当の職員の名前は、完全一致で絞る。
func (r *PatientRepository) ListByFacility(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error) {
	params := sqlcgen.ListPatientsByFacilityParams{
		FacilityID:    facilityID,
		Name:          q.Name,
		AssignedStaff: q.AssignedStaff,
		Sort:          q.Sort.Key(),
	}
	if q.PreferredTime != nil {
		params.PreferredTime = ptr(string(*q.PreferredTime))
	}
	if q.PreferredGender != nil {
		params.PreferredGender = ptr(string(*q.PreferredGender))
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
