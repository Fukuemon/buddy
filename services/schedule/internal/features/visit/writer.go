package visit

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Input は、訪問の予定に付ける訪問の情報の入力である。
// KeptPatientID は、利用の終了の利用者のまま保存してよい、予定に既に付けた利用者である。呼ぶ側は、今日より前の予定でだけ指定する（ADR-0021）。
type Input struct {
	PatientID       string
	AssignedStaffID string
	CompanionID     *string
	ServiceCodeID   string
	CategoryIDs     []string
	KeptPatientID   string
}

// WriterDeps は、Writer が使うリポジトリと、ほかの機能のデータを読むインターフェースである。
type WriterDeps struct {
	Staff        kernel.Finder[staff.Ref]
	Patients     patient.Getter
	Infos        InfoRepository
	ServiceCodes kernel.Finder[servicecode.ServiceCode]
	Categories   CategoryRepository
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

// Create は、in の参照が facilityID の事業所に属することを確認して訪問の情報を保存し、その ID を返す。
// 利用者が利用の終了で、in.KeptPatientID と違うときは、入力のエラーを返す（ADR-0021）。
func (w Writer) Create(ctx context.Context, facilityID string, in Input) (string, error) {
	pa, err := w.deps.Patients.Get(ctx, in.PatientID)
	if err != nil {
		return "", apperr.Reference("利用者", in.PatientID, err)
	}
	if err := apperr.SameFacility("利用者", pa.ID, pa.FacilityID, facilityID); err != nil {
		return "", err
	}
	if pa.IsEnded() && pa.ID != in.KeptPatientID {
		return "", apperr.Invalid("利用の終了の利用者 %s には、今日以降の予定と新しい予定を作れません", pa.ID)
	}
	patientID := pa.ID
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
	if _, err := w.deps.ServiceCodes.Get(ctx, in.ServiceCodeID); err != nil {
		return "", apperr.Reference("サービスコード", in.ServiceCodeID, err)
	}
	if len(in.CategoryIDs) > 0 {
		found, err := w.deps.Categories.ListByIDs(ctx, in.CategoryIDs)
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
		FacilityID:      facilityID,
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
