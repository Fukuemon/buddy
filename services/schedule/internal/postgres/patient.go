package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// PatientRepository は、patient.Repository を実装する。
type PatientRepository struct{ conn }

// NewPatientRepository は PatientRepository を作る。
func NewPatientRepository(pool *pgxpool.Pool) *PatientRepository {
	return &PatientRepository{conn{pool}}
}

// Create は、利用者を書く。事業所、サービスコード、担当の職員のいずれかが無いか、値がカラムの制約（希望の時間帯と性別の値など）に合わないときは apperr.ErrInvalidInput のエラーを返す。
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

// Update は、利用者 p.ID の名前、希望、サービスコード、担当の職員を書き換える。利用者が無いときは apperr.ErrNotFound を、
// サービスコードか担当の職員が無いときは apperr.ErrInvalidInput のエラーを返す。
func (r *PatientRepository) Update(ctx context.Context, p patient.Patient) error {
	n, err := r.q(ctx).UpdatePatient(ctx, sqlcgen.UpdatePatientParams{
		ID:              p.ID,
		Name:            p.Name,
		PreferredTime:   string(p.PreferredTime),
		PreferredGender: string(p.PreferredGender),
		ServiceCodeID:   p.ServiceCodeID,
		AssignedStaffID: p.AssignedStaffID,
	})
	return touched("update patient", n, err)
}

// End は、利用者 id を利用の終了にする。利用の終了にし直しても、最初に利用の終了にした時刻を残す。利用者が無いときは apperr.ErrNotFound を返す。
func (r *PatientRepository) End(ctx context.Context, id string) error {
	n, err := r.q(ctx).EndPatientService(ctx, id)
	return touched("end patient service", n, err)
}

// Resume は、利用者 id を利用中に戻し、担当の職員を assignedStaffID にする。利用者が無いときは apperr.ErrNotFound を、
// 職員が無いときは apperr.ErrInvalidInput のエラーを返す。
func (r *PatientRepository) Resume(ctx context.Context, id, assignedStaffID string) error {
	n, err := r.q(ctx).ResumePatientService(ctx, sqlcgen.ResumePatientServiceParams{ID: id, AssignedStaffID: assignedStaffID})
	return touched("resume patient service", n, err)
}

// touched は、書き込みのエラーを変換し、書いた行が無ければ apperr.ErrNotFound を返す。
func touched(op string, n int64, err error) error {
	if err != nil {
		return translate(op, err)
	}
	if n == 0 {
		return apperr.ErrNotFound
	}
	return nil
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
// 名前と担当の職員の名前は、完全一致で絞る。q.IncludeEnded が false なら、利用の終了の利用者を除く。
func (r *PatientRepository) ListByFacility(ctx context.Context, facilityID string, q patient.ListQuery) ([]patient.Detail, error) {
	params := sqlcgen.ListPatientsByFacilityParams{
		FacilityID:    facilityID,
		IncludeEnded:  q.IncludeEnded,
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
			EndedAt:         row.EndedAt,
		},
		ServiceCode:       row.ServiceCode,
		AssignedStaffName: row.AssignedStaffName,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}

// PatientScheduleReader は、patient.ScheduleReader を、予定、繰り返しの予定、訪問の情報のテーブルで実装する。
type PatientScheduleReader struct{ conn }

// NewPatientScheduleReader は PatientScheduleReader を作る。
func NewPatientScheduleReader(pool *pgxpool.Pool) *PatientScheduleReader {
	return &PatientScheduleReader{conn{pool}}
}

// From は、事業所 facilityID の利用者 patientID の、from 以降のキャンセルしていない予定（日時の順）と、from 以降に終わる
// 繰り返しの予定（最初の回の日時の順）を返す。
func (r *PatientScheduleReader) From(ctx context.Context, facilityID, patientID string, from civil.Date) (patient.Remaining, error) {
	q := r.q(ctx)
	scheds, err := q.ListPatientSchedulesFrom(ctx, sqlcgen.ListPatientSchedulesFromParams{FacilityID: facilityID, PatientID: patientID, FromDate: from.Time()})
	if err != nil {
		return patient.Remaining{}, translate("list patient schedules", err)
	}
	recs, err := q.ListPatientRecurringSchedulesFrom(ctx, sqlcgen.ListPatientRecurringSchedulesFromParams{FacilityID: facilityID, PatientID: patientID, FromDate: from.Time()})
	if err != nil {
		return patient.Remaining{}, translate("list patient recurring schedules", err)
	}
	out := patient.Remaining{
		Schedules:          make([]patient.RemainingSchedule, len(scheds)),
		RecurringSchedules: make([]patient.RemainingRecurring, len(recs)),
	}
	for i, s := range scheds {
		start, end, err := slotTimes(s.StartTime, s.EndTime)
		if err != nil {
			return patient.Remaining{}, err
		}
		out.Schedules[i] = patient.RemainingSchedule{ID: s.ID, Date: civil.DateOf(s.Date), StartTime: start, EndTime: end}
	}
	for i, s := range recs {
		start, end, err := slotTimes(s.StartTime, s.EndTime)
		if err != nil {
			return patient.Remaining{}, err
		}
		out.RecurringSchedules[i] = patient.RemainingRecurring{ID: s.ID, Date: civil.DateOf(s.Date), EndDate: datePtr(s.EndDate), StartTime: start, EndTime: end}
	}
	return out, nil
}
