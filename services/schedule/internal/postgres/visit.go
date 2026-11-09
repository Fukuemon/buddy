package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// VisitInfoRepository は、visit.InfoRepository を実装する。
type VisitInfoRepository struct{ conn }

// NewVisitInfoRepository は VisitInfoRepository を作る。
func NewVisitInfoRepository(pool *pgxpool.Pool) *VisitInfoRepository {
	return &VisitInfoRepository{conn{pool}}
}

// VisitCategoryRepository は、visit.CategoryRepository を実装する。
type VisitCategoryRepository struct{ conn }

// NewVisitCategoryRepository は VisitCategoryRepository を作る。
func NewVisitCategoryRepository(pool *pgxpool.Pool) *VisitCategoryRepository {
	return &VisitCategoryRepository{conn{pool}}
}

// Create は、訪問の情報と区分を続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *VisitInfoRepository) Create(ctx context.Context, i visit.Info) error {
	q := r.q(ctx)
	err := q.CreateVisitInfo(ctx, sqlcgen.CreateVisitInfoParams{
		ID:              i.ID,
		FacilityID:      i.FacilityID,
		PatientID:       i.PatientID,
		AssignedStaffID: i.AssignedStaffID,
		CompanionID:     i.CompanionID,
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

// DeleteIfUnused は、予定、繰り返しの予定、Google カレンダーに書いた予定の記録のどれも指していない訪問の情報 id を、区分の結び付きごと消す。
// 指されているか、無いときは何もせず、エラーも返さない。
func (r *VisitInfoRepository) DeleteIfUnused(ctx context.Context, id string) error {
	return translate("delete visit info", r.q(ctx).DeleteUnusedVisitInfo(ctx, id))
}

// GetDetail は、calendarwrite.VisitDetails の GetDetail を実装する。訪問の情報 id を、名前と区分を付けて返す。
func (r *VisitInfoRepository) GetDetail(ctx context.Context, id string) (visit.Detail, error) {
	row, err := r.q(ctx).GetVisitInfoDetail(ctx, id)
	if err != nil {
		return visit.Detail{}, translate("get visit info detail", err)
	}
	categories, err := r.visitCategories(ctx, []string{id})
	if err != nil {
		return visit.Detail{}, err
	}
	d := visitDetailColumns{
		VisitInfoID: &row.ID, PatientID: &row.PatientID, PatientName: &row.PatientName,
		AssignedStaffID: &row.AssignedStaffID, AssignedStaffName: &row.AssignedStaffName,
		CompanionID: row.CompanionID, CompanionName: row.CompanionName, ServiceCodeID: &row.ServiceCodeID, ServiceCode: &row.ServiceCode,
	}.detail(categories)
	return *d, nil
}

// List は、すべての訪問の区分を名前、ID の順に返す。
func (r *VisitCategoryRepository) List(ctx context.Context) ([]visit.Category, error) {
	rows, err := r.q(ctx).ListVisitCategories(ctx)
	if err != nil {
		return nil, translate("list visit categories", err)
	}
	return categories(rows), nil
}

// ListByIDs は、ids のうち見つかった区分だけを名前、ID の順に返す。ids が空のときは問い合わせずに空のスライスを返す。
func (r *VisitCategoryRepository) ListByIDs(ctx context.Context, ids []string) ([]visit.Category, error) {
	if len(ids) == 0 {
		return []visit.Category{}, nil
	}
	rows, err := r.q(ctx).ListVisitCategoriesByIDs(ctx, ids)
	if err != nil {
		return nil, translate("list visit categories by ids", err)
	}
	return categories(rows), nil
}

func categories(rows []sqlcgen.VisitCategory) []visit.Category {
	out := make([]visit.Category, len(rows))
	for i, c := range rows {
		out[i] = visit.Category{ID: c.ID, Name: c.Name}
	}
	return out
}

// visitDetailColumns は、予定の詳細のビューが持つ訪問の情報のカラムである。
type visitDetailColumns struct {
	VisitInfoID       *string
	PatientID         *string
	PatientName       *string
	AssignedStaffID   *string
	AssignedStaffName *string
	CompanionID       *string
	CompanionName     *string
	ServiceCodeID     *string
	ServiceCode       *string
}

// deref は、NULL になりうる列の値を返し、NULL なら空を返す。
func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// detail は、訪問の情報がない予定のときに nil を返す。区分は categories から visit_info_id で引く。
func (c visitDetailColumns) detail(categories map[string][]visit.Category) *visit.Detail {
	if c.VisitInfoID == nil {
		return nil
	}
	cats := categories[*c.VisitInfoID]
	if cats == nil {
		cats = []visit.Category{}
	}
	return &visit.Detail{
		ID:                deref(c.VisitInfoID),
		PatientID:         deref(c.PatientID),
		PatientName:       deref(c.PatientName),
		AssignedStaffID:   deref(c.AssignedStaffID),
		AssignedStaffName: deref(c.AssignedStaffName),
		CompanionID:       c.CompanionID,
		CompanionName:     c.CompanionName,
		ServiceCodeID:     deref(c.ServiceCodeID),
		ServiceCode:       deref(c.ServiceCode),
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
