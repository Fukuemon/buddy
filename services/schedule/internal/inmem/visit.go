package inmem

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// VisitInfos は、visit.InfoRepository のメモリ上の実装である。
type VisitInfos struct{ *Store }

// Create は、visit.InfoRepository の Create を実装する。
func (s VisitInfos) Create(_ context.Context, i visit.Info) error {
	s.Infos[i.ID] = i
	return nil
}

// DeleteIfUnused は、visit.InfoRepository の DeleteIfUnused を実装する。
func (s VisitInfos) DeleteIfUnused(_ context.Context, id string) error {
	for _, d := range s.Schedules {
		if d.VisitInfoID != nil && *d.VisitInfoID == id {
			return nil
		}
	}
	for _, d := range s.Recurring {
		if d.VisitInfoID != nil && *d.VisitInfoID == id {
			return nil
		}
	}
	delete(s.Infos, id)
	return nil
}

// VisitCategories は、visit.CategoryRepository のメモリ上の実装である。
type VisitCategories struct{ *Store }

// List は、常に空を返す。
func (s VisitCategories) List(context.Context) ([]visit.Category, error) { return nil, nil }

// ListByIDs は、visit.CategoryRepository の ListByIDs を実装する。
func (s VisitCategories) ListByIDs(_ context.Context, ids []string) ([]visit.Category, error) {
	var out []visit.Category
	for _, id := range ids {
		if c, ok := s.Categories[id]; ok {
			out = append(out, c)
		}
	}
	return out, nil
}
