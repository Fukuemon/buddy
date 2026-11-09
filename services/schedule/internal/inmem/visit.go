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
	for _, r := range s.Records {
		if (r.VisitInfoID != nil && *r.VisitInfoID == id) || (r.Pending != nil && r.Pending.VisitInfoID != nil && *r.Pending.VisitInfoID == id) {
			return nil
		}
	}
	delete(s.Infos, id)
	return nil
}

// GetDetail は、calendarwrite.VisitDetails の GetDetail を実装する。名前は、利用者、職員、サービスコード、区分のマスタから引く。
func (s VisitInfos) GetDetail(_ context.Context, id string) (visit.Detail, error) {
	i, err := get(s.Infos, id)
	if err != nil {
		return visit.Detail{}, err
	}
	d := visit.Detail{
		ID: i.ID, PatientID: i.PatientID, PatientName: s.Patients[i.PatientID].Name,
		AssignedStaffID: i.AssignedStaffID, AssignedStaffName: s.Staff[i.AssignedStaffID].Username,
		CompanionID: i.CompanionID, ServiceCodeID: i.ServiceCodeID, ServiceCode: s.Codes[i.ServiceCodeID].Code,
		Categories: []visit.Category{},
	}
	if i.CompanionID != nil {
		name := s.Staff[*i.CompanionID].Username
		d.CompanionName = &name
	}
	for _, c := range i.CategoryIDs {
		d.Categories = append(d.Categories, s.Categories[c])
	}
	return d, nil
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

// info は、ID が id の訪問の情報を返す。id が nil か、訪問の情報が無ければ nil を返す。
func (s *Store) info(id *string) *visit.Info {
	if id == nil {
		return nil
	}
	i, ok := s.Infos[*id]
	if !ok {
		return nil
	}
	return &i
}

// visit は、ID が id の訪問の情報を返す。id が nil か、訪問の情報が無ければ nil を返す。
func (s *Store) visit(id *string) *visit.Detail {
	if id == nil {
		return nil
	}
	i, ok := s.Infos[*id]
	if !ok {
		return nil
	}
	return &visit.Detail{
		ID: i.ID, PatientID: i.PatientID, AssignedStaffID: i.AssignedStaffID, CompanionID: i.CompanionID, ServiceCodeID: i.ServiceCodeID,
	}
}
