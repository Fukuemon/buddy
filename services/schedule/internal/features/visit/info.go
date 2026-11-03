package visit

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// Info は、訪問の予定に付く訪問の情報である。CompanionID は同行する職員で、いないときは nil である。
type Info struct {
	ID              string
	FacilityID      string
	PatientID       string
	AssignedStaffID string
	CompanionID     *string
	ServiceCodeID   string
	CategoryIDs     []string
}

// NewInfo は、同行者と区分の重なりを検証して Info を作る。
func NewInfo(i Info) (Info, error) {
	if i.CompanionID != nil && *i.CompanionID == i.AssignedStaffID {
		return Info{}, apperr.Invalid("同行者に担当の職員と同じ職員は指定できません")
	}
	seen := make(map[string]bool, len(i.CategoryIDs))
	for _, id := range i.CategoryIDs {
		if seen[id] {
			return Info{}, apperr.Invalid("訪問の区分 %s が重なっています", id)
		}
		seen[id] = true
	}
	return i, nil
}

// Detail は、訪問の情報と、関わる利用者、職員、サービスコード、区分の名前である。
type Detail struct {
	ID                string
	PatientID         string
	PatientName       string
	AssignedStaffID   string
	AssignedStaffName string
	CompanionID       *string
	CompanionName     *string
	ServiceCodeID     string
	ServiceCode       string
	Categories        []Category
}

// InfoRepository は、訪問の情報を書く。
type InfoRepository interface {
	Create(ctx context.Context, i Info) error
	// DeleteIfUnused は、どの予定と繰り返しの予定も指していない訪問の情報を消す。指されているか、無いときは何もしない。
	DeleteIfUnused(ctx context.Context, id string) error
}
