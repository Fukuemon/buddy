package usecase

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

// VisitMasters は、訪問の情報のマスタの操作である。
type VisitMasters struct {
	visits visit.Repository
}

// NewVisitMasters は VisitMasters を作る。
func NewVisitMasters(visits visit.Repository) *VisitMasters {
	return &VisitMasters{visits: visits}
}

// ListServiceCodes は、すべてのサービスコードを返す。
func (v *VisitMasters) ListServiceCodes(ctx context.Context) ([]visit.ServiceCode, error) {
	return v.visits.ListServiceCodes(ctx)
}

// ListCategories は、すべての訪問の区分を返す。
func (v *VisitMasters) ListCategories(ctx context.Context) ([]visit.Category, error) {
	return v.visits.ListCategories(ctx)
}

// VisitInput は、訪問の予定に付ける訪問の情報の入力である。
type VisitInput struct {
	PatientID       string
	AssignedStaffID string
	CompanionID     *string
	ServiceCodeID   string
	CategoryIDs     []string
}

// visitWriter は、参照を検証して訪問の情報を保存する。
type visitWriter struct {
	staff    staff.Repository
	patients patient.Repository
	visits   visit.Repository
	ids      domain.IDGenerator
}

// create は、in の参照が facilityID の事業所に属することを確かめて訪問の情報を保存し、その ID を返す。
func (w visitWriter) create(ctx context.Context, facilityID string, in VisitInput) (string, error) {
	pa, err := w.patients.Get(ctx, in.PatientID)
	if err != nil {
		return "", reference("利用者", in.PatientID, err)
	}
	if err := sameFacility("利用者", pa.ID, pa.FacilityID, facilityID); err != nil {
		return "", err
	}
	staffIDs := []string{in.AssignedStaffID}
	if in.CompanionID != nil {
		staffIDs = append(staffIDs, *in.CompanionID)
	}
	for _, id := range staffIDs {
		st, err := w.staff.Get(ctx, id)
		if err != nil {
			return "", reference("職員", id, err)
		}
		if err := sameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
			return "", err
		}
	}
	if _, err := w.visits.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return "", reference("サービスコード", in.ServiceCodeID, err)
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
	info, err := visit.NewInfo(visit.Info{
		ID:              w.ids.NewID(),
		PatientID:       pa.ID,
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
