package visit

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
)

// Service は、訪問の情報のマスタの操作である。
type Service struct {
	visits Repository
}

// NewService は Service を作る。
func NewService(visits Repository) *Service {
	return &Service{visits: visits}
}

// ListServiceCodes は、すべてのサービスコードを返す。
func (v *Service) ListServiceCodes(ctx context.Context) ([]ServiceCode, error) {
	return v.visits.ListServiceCodes(ctx)
}

// ListCategories は、すべての訪問の区分を返す。
func (v *Service) ListCategories(ctx context.Context) ([]Category, error) {
	return v.visits.ListCategories(ctx)
}

// Input は、訪問の予定に付ける訪問の情報の入力である。
type Input struct {
	PatientID       string
	AssignedStaffID string
	CompanionID     *string
	ServiceCodeID   string
	CategoryIDs     []string
}

// PatientFinder は、ID が id の利用者を探し、利用者の ID と、利用者が属する事業所の ID を返す。
// 利用者が見つからないときは domain.ErrNotFound を返す。
// patient が visit に依存するので、visit は patient.Repository を直接は受け取らない。
type PatientFinder func(ctx context.Context, id string) (patientID, facilityID string, err error)

// Writer は、参照を検証して訪問の情報を保存する。
type Writer struct {
	staff    staff.Repository
	patients PatientFinder
	visits   Repository
	ids      domain.IDGenerator
}

// NewWriter は Writer を作る。
func NewWriter(staffRepo staff.Repository, patients PatientFinder, visits Repository, ids domain.IDGenerator) Writer {
	return Writer{staff: staffRepo, patients: patients, visits: visits, ids: ids}
}

// Create は、in の参照が facilityID の事業所に属することを確かめて訪問の情報を保存し、その ID を返す。
func (w Writer) Create(ctx context.Context, facilityID string, in Input) (string, error) {
	patientID, patientFacilityID, err := w.patients(ctx, in.PatientID)
	if err != nil {
		return "", domain.Reference("利用者", in.PatientID, err)
	}
	if err := domain.SameFacility("利用者", patientID, patientFacilityID, facilityID); err != nil {
		return "", err
	}
	staffIDs := []string{in.AssignedStaffID}
	if in.CompanionID != nil {
		staffIDs = append(staffIDs, *in.CompanionID)
	}
	for _, id := range staffIDs {
		st, err := w.staff.Get(ctx, id)
		if err != nil {
			return "", domain.Reference("職員", id, err)
		}
		if err := domain.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
			return "", err
		}
	}
	if _, err := w.visits.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return "", domain.Reference("サービスコード", in.ServiceCodeID, err)
	}
	if len(in.CategoryIDs) > 0 {
		found, err := w.visits.ListCategoriesByIDs(ctx, in.CategoryIDs)
		if err != nil {
			return "", err
		}
		known := make(map[string]bool, len(found))
		for _, c := range found {
			known[c.ID] = true
		}
		for _, id := range in.CategoryIDs {
			if !known[id] {
				return "", domain.Invalid("訪問の区分 %s が見つかりません", id)
			}
		}
	}
	info, err := NewInfo(Info{
		ID:              w.ids.NewID(),
		PatientID:       patientID,
		AssignedStaffID: in.AssignedStaffID,
		CompanionID:     in.CompanionID,
		ServiceCodeID:   in.ServiceCodeID,
		CategoryIDs:     in.CategoryIDs,
	})
	if err != nil {
		return "", err
	}
	if err := w.visits.CreateInfo(ctx, info); err != nil {
		return "", err
	}
	return info.ID, nil
}
