package visit

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/kernel"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
)

// Usecase は、訪問の情報のマスタの操作である。
type Usecase struct {
	masters MasterRepository
}

// NewUsecase は Usecase を作る。
func NewUsecase(masters MasterRepository) *Usecase {
	return &Usecase{masters: masters}
}

// ListServiceCodes は、すべてのサービスコードを返す。
func (v *Usecase) ListServiceCodes(ctx context.Context) ([]ServiceCode, error) {
	return v.masters.ListServiceCodes(ctx)
}

// ListCategories は、すべての訪問の区分を返す。
func (v *Usecase) ListCategories(ctx context.Context) ([]Category, error) {
	return v.masters.ListCategories(ctx)
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
// 利用者が見つからないときは apperr.ErrNotFound を返す。
// patient が visit に依存するので、visit は patient を import せずに関数で受け取る。
type PatientFinder func(ctx context.Context, id string) (patientID, facilityID string, err error)

// WriterDeps は、Writer が使うリポジトリと、ほかの機能のデータを読むインターフェイスである。
type WriterDeps struct {
	Staff    kernel.Finder[staff.Ref]
	Patients PatientFinder
	Infos    InfoRepository
	Masters  MasterRepository
}

// Writer は、参照を検証して訪問の情報を保存し、使われなくなった訪問の情報を消す。予定の操作の手順から呼ぶ。
type Writer struct {
	deps WriterDeps
	ids  kernel.IDGenerator
}

// NewWriter は Writer を作る。
func NewWriter(deps WriterDeps, ids kernel.IDGenerator) Writer {
	return Writer{deps: deps, ids: ids}
}

// Create は、in の参照が facilityID の事業所に属することを確かめて訪問の情報を保存し、その ID を返す。
func (w Writer) Create(ctx context.Context, facilityID string, in Input) (string, error) {
	patientID, patientFacilityID, err := w.deps.Patients(ctx, in.PatientID)
	if err != nil {
		return "", apperr.Reference("利用者", in.PatientID, err)
	}
	if err := apperr.SameFacility("利用者", patientID, patientFacilityID, facilityID); err != nil {
		return "", err
	}
	staffIDs := []string{in.AssignedStaffID}
	if in.CompanionID != nil {
		staffIDs = append(staffIDs, *in.CompanionID)
	}
	for _, id := range staffIDs {
		st, err := w.deps.Staff.Get(ctx, id)
		if err != nil {
			return "", apperr.Reference("職員", id, err)
		}
		if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
			return "", err
		}
	}
	if _, err := w.deps.Masters.GetServiceCode(ctx, in.ServiceCodeID); err != nil {
		return "", apperr.Reference("サービスコード", in.ServiceCodeID, err)
	}
	if len(in.CategoryIDs) > 0 {
		found, err := w.deps.Masters.ListCategoriesByIDs(ctx, in.CategoryIDs)
		if err != nil {
			return "", err
		}
		known := make(map[string]bool, len(found))
		for _, c := range found {
			known[c.ID] = true
		}
		for _, id := range in.CategoryIDs {
			if !known[id] {
				return "", apperr.Invalid("訪問の区分 %s が見つかりません", id)
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
	if err := w.deps.Infos.Create(ctx, info); err != nil {
		return "", err
	}
	return info.ID, nil
}

// DeleteIfUnused は、どの予定と繰り返しの予定も指していない訪問の情報 id を消す。指されているか、無いときは何もしない。
func (w Writer) DeleteIfUnused(ctx context.Context, id string) error {
	return w.deps.Infos.DeleteIfUnused(ctx, id)
}
