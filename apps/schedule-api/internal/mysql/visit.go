package mysql

import (
	"context"
	"database/sql"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/mysql/sqlcgen"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

// VisitInfoRepository は、visit.InfoRepository を実装する。
type VisitInfoRepository struct{ conn }

// NewVisitInfoRepository は VisitInfoRepository を作る。
func NewVisitInfoRepository(db *sql.DB) *VisitInfoRepository { return &VisitInfoRepository{conn{db}} }

// VisitMasterRepository は、visit.MasterRepository を実装する。
type VisitMasterRepository struct{ conn }

// NewVisitMasterRepository は VisitMasterRepository を作る。
func NewVisitMasterRepository(db *sql.DB) *VisitMasterRepository {
	return &VisitMasterRepository{conn{db}}
}

// Create は、訪問の情報と区分を続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *VisitInfoRepository) Create(ctx context.Context, i visit.Info) error {
	q := r.q(ctx)
	err := q.CreateVisitInfo(ctx, sqlcgen.CreateVisitInfoParams{
		ID:              i.ID,
		PatientID:       i.PatientID,
		AssignedStaffID: i.AssignedStaffID,
		CompanionID:     nullString(i.CompanionID),
		ServiceCodeID:   i.ServiceCodeID,
	})
	if err != nil {
		return translate("create visit info", err)
	}
	for _, c := range i.CategoryIDs {
		err := q.AddVisitInfoCategory(ctx, sqlcgen.AddVisitInfoCategoryParams{VisitInfoID: i.ID, VisitCategoryID: c})
		if err != nil {
			return translate("add visit info category", err)
		}
	}
	return nil
}

// DeleteIfUnused は、予定と繰り返しの予定のどれも指していない訪問の情報 id を、区分の結び付きごと消す。
// 指されているか、無いときは何もせず、エラーも返さない。
func (r *VisitInfoRepository) DeleteIfUnused(ctx context.Context, id string) error {
	return translate("delete visit info", r.q(ctx).DeleteUnusedVisitInfo(ctx, id))
}

// GetServiceCode は、ID が id のサービスコードを返す。無いときは apperr.ErrNotFound を返す。
func (r *VisitMasterRepository) GetServiceCode(ctx context.Context, id string) (visit.ServiceCode, error) {
	c, err := r.q(ctx).GetServiceCode(ctx, id)
	if err != nil {
		return visit.ServiceCode{}, translate("get service code", err)
	}
	return serviceCode(c), nil
}

// ListServiceCodes は、すべてのサービスコードをコード、ID の順に返す。
func (r *VisitMasterRepository) ListServiceCodes(ctx context.Context) ([]visit.ServiceCode, error) {
	rows, err := r.q(ctx).ListServiceCodes(ctx)
	if err != nil {
		return nil, translate("list service codes", err)
	}
	out := make([]visit.ServiceCode, len(rows))
	for i, c := range rows {
		out[i] = serviceCode(c)
	}
	return out, nil
}

// ListCategories は、すべての訪問の区分を名前、ID の順に返す。
func (r *VisitMasterRepository) ListCategories(ctx context.Context) ([]visit.Category, error) {
	rows, err := r.q(ctx).ListVisitCategories(ctx)
	if err != nil {
		return nil, translate("list visit categories", err)
	}
	return categories(rows), nil
}

// ListCategoriesByIDs は、ids のうち見つかった区分だけを名前、ID の順に返す。ids が空のときは問い合わせずに空のスライスを返す。
func (r *VisitMasterRepository) ListCategoriesByIDs(ctx context.Context, ids []string) ([]visit.Category, error) {
	if len(ids) == 0 {
		return []visit.Category{}, nil
	}
	rows, err := r.q(ctx).ListVisitCategoriesByIDs(ctx, ids)
	if err != nil {
		return nil, translate("list visit categories by ids", err)
	}
	return categories(rows), nil
}

func serviceCode(c sqlcgen.ServiceCode) visit.ServiceCode {
	return visit.ServiceCode{
		ID: c.ID, Code: c.Code,
		StartMinutes: int(c.ServiceTimeRangeStart), EndMinutes: int(c.ServiceTimeRangeEnd),
	}
}

func categories(rows []sqlcgen.VisitCategory) []visit.Category {
	out := make([]visit.Category, len(rows))
	for i, c := range rows {
		out[i] = visit.Category{ID: c.ID, Name: c.Name}
	}
	return out
}

// visitDetailColumns は、予定の詳細のビューが持つ訪問の情報の列である。
type visitDetailColumns struct {
	VisitInfoID       sql.NullString
	PatientID         sql.NullString
	PatientName       sql.NullString
	AssignedStaffID   sql.NullString
	AssignedStaffName sql.NullString
	CompanionID       sql.NullString
	CompanionName     sql.NullString
	ServiceCodeID     sql.NullString
	ServiceCode       sql.NullString
}

// detail は、訪問の情報がない予定のときに nil を返す。区分は categories から visit_info_id で引く。
func (c visitDetailColumns) detail(categories map[string][]visit.Category) *visit.Detail {
	if !c.VisitInfoID.Valid {
		return nil
	}
	cats := categories[c.VisitInfoID.String]
	if cats == nil {
		cats = []visit.Category{}
	}
	return &visit.Detail{
		ID:                c.VisitInfoID.String,
		PatientID:         c.PatientID.String,
		PatientName:       c.PatientName.String,
		AssignedStaffID:   c.AssignedStaffID.String,
		AssignedStaffName: c.AssignedStaffName.String,
		CompanionID:       stringPtr(c.CompanionID),
		CompanionName:     stringPtr(c.CompanionName),
		ServiceCodeID:     c.ServiceCodeID.String,
		ServiceCode:       c.ServiceCode.String,
		Categories:        cats,
	}
}

// visitCategories は、visitInfoIDs の訪問の情報の区分を、visit_info_id ごとにまとめて返す。
func (c conn) visitCategories(ctx context.Context, visitInfoIDs []string) (map[string][]visit.Category, error) {
	out := make(map[string][]visit.Category)
	if len(visitInfoIDs) == 0 {
		return out, nil
	}
	rows, err := c.q(ctx).ListVisitInfoCategories(ctx, visitInfoIDs)
	if err != nil {
		return nil, translate("list visit info categories", err)
	}
	for _, r := range rows {
		out[r.VisitInfoID] = append(out[r.VisitInfoID], visit.Category{ID: r.ID, Name: r.Name})
	}
	return out, nil
}
