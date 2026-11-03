package visit

import (
	"context"
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

// MasterRepository は、サービスコードと訪問の区分のマスタを読む。GetServiceCode は、見つからないときに apperr.ErrNotFound を返す。
// ListCategoriesByIDs は、見つかったものだけを返す。
type MasterRepository interface {
	GetServiceCode(ctx context.Context, id string) (ServiceCode, error)
	ListServiceCodes(ctx context.Context) ([]ServiceCode, error)
	ListCategories(ctx context.Context) ([]Category, error)
	ListCategoriesByIDs(ctx context.Context, ids []string) ([]Category, error)
}
