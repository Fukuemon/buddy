// Package visit は、訪問の予定に付く訪問の情報と、そのマスタ（サービスコード、訪問の区分）を表す。
package visit

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
)

// ServiceCode は、レセプトのサービスコードである。StartMinutes と EndMinutes は、対象の提供時間の範囲である。
type ServiceCode struct {
	ID           string
	Code         string
	StartMinutes int
	EndMinutes   int
}

// Category は、夜勤や緊急のような訪問の区分である。
type Category struct {
	ID   string
	Name string
}

// Info は、訪問の予定に付く訪問の情報である。CompanionID は同行する職員で、いないときは nil である。
type Info struct {
	ID              string
	PatientID       string
	AssignedStaffID string
	CompanionID     *string
	ServiceCodeID   string
	CategoryIDs     []string
}

// NewInfo は、同行者と区分の重なりを検証して Info を作る。
func NewInfo(i Info) (Info, error) {
	if i.CompanionID != nil && *i.CompanionID == i.AssignedStaffID {
		return Info{}, domain.Invalid("同行者に担当の職員と同じ職員は指定できません")
	}
	seen := make(map[string]bool, len(i.CategoryIDs))
	for _, id := range i.CategoryIDs {
		if seen[id] {
			return Info{}, domain.Invalid("訪問の区分 %s が重なっています", id)
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

// Repository は、訪問の情報とマスタを読み書きする。GetServiceCode は、見つからないときに domain.ErrNotFound を返す。
// ListCategoriesByIDs は、見つかったものだけを返す。
type Repository interface {
	CreateInfo(ctx context.Context, i Info) error
	GetServiceCode(ctx context.Context, id string) (ServiceCode, error)
	ListServiceCodes(ctx context.Context) ([]ServiceCode, error)
	ListCategories(ctx context.Context) ([]Category, error)
	ListCategoriesByIDs(ctx context.Context, ids []string) ([]Category, error)
}
