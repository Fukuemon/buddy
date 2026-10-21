package schedule

import (
	"context"
	"fmt"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/auth"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

// Repositories は、Service が使うリポジトリである。
type Repositories struct {
	Facilities organization.FacilityRepository
	Staff      staff.Repository
	Patients   patient.Repository
	Visits     visit.Repository
	Schedules  Repository
}

// Service は、予定の操作である。操作は、ctx の職員（auth.Principal）の権限で判定する。
// 見てよくない予定は一覧から除き、1 件を指す操作には domain.ErrForbidden を返す。ctx に職員がいなければ domain.ErrForbidden を返す。
type Service struct {
	repos  Repositories
	tx     domain.Transactor
	ids    domain.IDGenerator
	visits visit.Writer
}

// NewService は Service を作る。
func NewService(repos Repositories, tx domain.Transactor, ids domain.IDGenerator) *Service {
	findPatient := func(ctx context.Context, id string) (string, string, error) {
		pa, err := repos.Patients.Get(ctx, id)
		return pa.ID, pa.FacilityID, err
	}
	return &Service{
		repos:  repos,
		tx:     tx,
		ids:    ids,
		visits: visit.NewWriter(repos.Staff, findPatient, repos.Visits, ids),
	}
}

// SlotInput は、単発と繰り返しの予定に共通の入力である。Visit は、訪問の予定のときに指定する。
type SlotInput struct {
	TypeID      string
	Date        civil.Date
	StartTime   civil.Time
	EndTime     civil.Time
	StaffID     string
	Title       *string
	Description *string
	Visit       *visit.Input
}

// RuleInput は、繰り返しの規則の入力である。
type RuleInput struct {
	Frequency   Frequency
	DayOfWeek   *int
	DayOfMonth  *int
	WeekOfMonth *int
	EndDate     *civil.Date
}

// List は、事業所の単発の予定と繰り返しの予定である。
type List struct {
	Schedules          []Detail
	RecurringSchedules []RecurringDetail
}

// ListTypes は、予定の種類を返す。
func (s *Service) ListTypes(ctx context.Context) ([]Type, error) {
	return s.repos.Schedules.ListTypes(ctx)
}

// Get は、単発の予定を返す。
func (s *Service) Get(ctx context.Context, id string) (Detail, error) {
	d, err := s.repos.Schedules.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := s.authorize(ctx, d.StaffID, false); err != nil {
		return Detail{}, err
	}
	return d, nil
}

// GetRecurring は、繰り返しの予定を返す。
func (s *Service) GetRecurring(ctx context.Context, id string) (RecurringDetail, error) {
	d, err := s.repos.Schedules.GetRecurring(ctx, id)
	if err != nil {
		return RecurringDetail{}, err
	}
	if err := s.authorize(ctx, d.StaffID, false); err != nil {
		return RecurringDetail{}, err
	}
	return d, nil
}

// List は、事業所の予定のうち、見てよい職員の予定を返す。事業所が見つからないときは domain.ErrNotFound を返す。
func (s *Service) List(ctx context.Context, facilityID string, q ListQuery) (List, error) {
	if err := q.Validate(); err != nil {
		return List{}, err
	}
	p, err := principal(ctx)
	if err != nil {
		return List{}, err
	}
	if _, err := s.repos.Facilities.Get(ctx, facilityID); err != nil {
		return List{}, err
	}
	readable, err := s.readable(ctx, p, facilityID)
	if err != nil {
		return List{}, err
	}
	single, err := s.repos.Schedules.ListByFacility(ctx, facilityID, q)
	if err != nil {
		return List{}, err
	}
	recurring, err := s.repos.Schedules.ListRecurringByFacility(ctx, facilityID, q)
	if err != nil {
		return List{}, err
	}
	return List{
		Schedules:          filter(single, func(d Detail) bool { return readable(d.StaffID) }),
		RecurringSchedules: filter(recurring, func(d RecurringDetail) bool { return readable(d.StaffID) }),
	}, nil
}

// readable は、事業所の職員のうち、p が予定を見てよい職員かを返す関数を返す。
func (s *Service) readable(ctx context.Context, p auth.Principal, facilityID string) (func(staffID string) bool, error) {
	if p.CanReadAll() {
		return func(string) bool { return true }, nil
	}
	sort, err := staff.ParseSort("", "")
	if err != nil {
		return nil, err
	}
	members, err := s.repos.Staff.ListByFacility(ctx, facilityID, staff.ListQuery{Sort: sort})
	if err != nil {
		return nil, err
	}
	ok := map[string]bool{p.Staff.ID: true}
	for _, m := range members {
		if p.CanRead(m.ID, m.TeamID) {
			ok[m.ID] = true
		}
	}
	return func(staffID string) bool { return ok[staffID] }, nil
}

func filter[T any](items []T, keep func(T) bool) []T {
	out := make([]T, 0, len(items))
	for _, it := range items {
		if keep(it) {
			out = append(out, it)
		}
	}
	return out
}

// principal は、認証のミドルウェアが ctx に入れた職員を返す。入っていなければ domain.ErrForbidden を返す。
func principal(ctx context.Context) (auth.Principal, error) {
	p, ok := auth.PrincipalFrom(ctx)
	if !ok {
		return auth.Principal{}, fmt.Errorf("%w: 職員を特定できません", domain.ErrForbidden)
	}
	return p, nil
}

// authorize は、ctx の職員が、職員 staffID の予定を見てよいか（edit なら編集してよいか）を確かめる。
func (s *Service) authorize(ctx context.Context, staffID string, edit bool) error {
	p, err := principal(ctx)
	if err != nil {
		return err
	}
	st, err := s.repos.Staff.Get(ctx, staffID)
	if err != nil {
		return err
	}
	return allow(p, st.ID, st.TeamID, edit)
}

func allow(p auth.Principal, staffID, teamID string, edit bool) error {
	if edit && !p.CanEdit(staffID, teamID) {
		return fmt.Errorf("%w: この職員の予定を編集する権限がありません", domain.ErrForbidden)
	}
	if !edit && !p.CanRead(staffID, teamID) {
		return fmt.Errorf("%w: この職員の予定を見る権限がありません", domain.ErrForbidden)
	}
	return nil
}

// Create は、事業所に単発の予定を作る。訪問の情報があれば同じトランザクションで保存する。
// 事業所が見つからないときは domain.ErrNotFound を、参照が見つからないか別の事業所のものであるときは入力の誤りを返す。
func (s *Service) Create(ctx context.Context, facilityID string, in SlotInput) (Detail, error) {
	if _, err := s.repos.Facilities.Get(ctx, facilityID); err != nil {
		return Detail{}, err
	}
	var created Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		created, err = s.createSchedule(ctx, facilityID, in, nil)
		return err
	})
	return created, err
}

// CreateRecurring は、事業所に繰り返しの予定を作る。エラーは Create と同じである。
func (s *Service) CreateRecurring(ctx context.Context, facilityID string, in SlotInput, rule RuleInput) (RecurringDetail, error) {
	if _, err := s.repos.Facilities.Get(ctx, facilityID); err != nil {
		return RecurringDetail{}, err
	}
	r, err := NewRule(Rule{
		ID:          s.ids.NewID(),
		Frequency:   rule.Frequency,
		DayOfWeek:   rule.DayOfWeek,
		DayOfMonth:  rule.DayOfMonth,
		WeekOfMonth: rule.WeekOfMonth,
		EndDate:     rule.EndDate,
	})
	if err != nil {
		return RecurringDetail{}, err
	}
	var created RecurringDetail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		slot, typ, err := s.prepareSlot(ctx, facilityID, in)
		if err != nil {
			return err
		}
		rs, err := NewRecurring(s.ids.NewID(), slot, typ, r)
		if err != nil {
			return err
		}
		if err := s.repos.Schedules.CreateRecurring(ctx, rs); err != nil {
			return err
		}
		created, err = s.repos.Schedules.GetRecurring(ctx, rs.ID)
		return err
	})
	return created, err
}

// ChangeOccurrence は、繰り返しの予定の originalDate の回を、in の内容の単発の予定に置き換える。
// 元の回は繰り返しの予定から除外し、作った単発の予定を返す。
// 繰り返しの予定が見つからないときは domain.ErrNotFound を、originalDate が回に当たらないときは入力の誤りを、
// その回をすでに置き換えたときは domain.ErrConflict を返す。
func (s *Service) ChangeOccurrence(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in SlotInput) (Detail, error) {
	rs, err := s.repos.Schedules.GetRecurring(ctx, recurringScheduleID)
	if err != nil {
		return Detail{}, err
	}
	if err := s.authorize(ctx, rs.StaffID, true); err != nil {
		return Detail{}, err
	}
	if !rs.Occurs(originalDate) {
		return Detail{}, domain.Invalid("%s は繰り返しの予定の回に当たりません", originalDate)
	}
	var created Detail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repos.Schedules.AddExclusion(ctx, rs.ID, originalDate); err != nil {
			return err
		}
		var err error
		created, err = s.createSchedule(ctx, rs.FacilityID, in, &rs.ID)
		return err
	})
	return created, err
}

// Cancel は、単発の予定をキャンセルする。予定が見つからないときは domain.ErrNotFound を、
// キャンセル済みのときは domain.ErrConflict を返す。
func (s *Service) Cancel(ctx context.Context, scheduleID, reason string) (Cancel, error) {
	c, err := NewCancel(s.ids.NewID(), scheduleID, reason)
	if err != nil {
		return Cancel{}, err
	}
	// Update と同じ行のロックの中で権限を確かめ、確かめた後に予定の職員が替わらないようにする。
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repos.Schedules.Lock(ctx, scheduleID); err != nil {
			return err
		}
		cur, err := s.repos.Schedules.Get(ctx, scheduleID)
		if err != nil {
			return err
		}
		if err := s.authorize(ctx, cur.StaffID, true); err != nil {
			return err
		}
		return s.repos.Schedules.CreateCancel(ctx, c)
	})
	if err != nil {
		return Cancel{}, err
	}
	return c, nil
}

// Update は、単発の予定の枠を in の内容に置き換える。訪問の情報は in の内容で作り直し、前の訪問の情報は消す。
// 予定が見つからないときは domain.ErrNotFound を、キャンセル済みのときは domain.ErrConflict を、
// 参照が見つからないか別の事業所のものであるときは入力の誤りを返す。
func (s *Service) Update(ctx context.Context, scheduleID string, in SlotInput) (Detail, error) {
	var updated Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repos.Schedules.Lock(ctx, scheduleID); err != nil {
			return err
		}
		cur, err := s.repos.Schedules.Get(ctx, scheduleID)
		if err != nil {
			return err
		}
		if err := s.authorize(ctx, cur.StaffID, true); err != nil {
			return err
		}
		if cur.Cancel != nil {
			return fmt.Errorf("%w: キャンセル済みの予定は変えられません", domain.ErrConflict)
		}
		slot, typ, err := s.prepareSlot(ctx, cur.FacilityID, in)
		if err != nil {
			return err
		}
		sc, err := New(cur.ID, slot, typ)
		if err != nil {
			return err
		}
		if err := s.repos.Schedules.Update(ctx, sc); err != nil {
			return err
		}
		if cur.VisitInfoID != nil {
			if err := s.repos.Visits.DeleteInfoIfUnused(ctx, *cur.VisitInfoID); err != nil {
				return err
			}
		}
		updated, err = s.repos.Schedules.Get(ctx, cur.ID)
		return err
	})
	return updated, err
}

func (s *Service) createSchedule(ctx context.Context, facilityID string, in SlotInput, recurringScheduleID *string) (Detail, error) {
	slot, typ, err := s.prepareSlot(ctx, facilityID, in)
	if err != nil {
		return Detail{}, err
	}
	sc, err := New(s.ids.NewID(), slot, typ)
	if err != nil {
		return Detail{}, err
	}
	sc.RecurringScheduleID = recurringScheduleID
	if err := s.repos.Schedules.Create(ctx, sc); err != nil {
		return Detail{}, err
	}
	return s.repos.Schedules.Get(ctx, sc.ID)
}

// prepareSlot は、予定の種類と職員と、職員の予定を編集する権限を確かめ、訪問の情報があれば保存して、予定の属性を組み立てる。
// 訪問の情報を保存するので、トランザクションの中で呼ぶ。
func (s *Service) prepareSlot(ctx context.Context, facilityID string, in SlotInput) (Slot, Type, error) {
	typ, err := s.repos.Schedules.GetType(ctx, in.TypeID)
	if err != nil {
		return Slot{}, Type{}, domain.Reference("予定の種類", in.TypeID, err)
	}
	st, err := s.repos.Staff.Get(ctx, in.StaffID)
	if err != nil {
		return Slot{}, Type{}, domain.Reference("職員", in.StaffID, err)
	}
	if err := domain.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
		return Slot{}, Type{}, err
	}
	p, err := principal(ctx)
	if err != nil {
		return Slot{}, Type{}, err
	}
	if err := allow(p, st.ID, st.TeamID, true); err != nil {
		return Slot{}, Type{}, err
	}
	slot := Slot{
		FacilityID:  facilityID,
		StaffID:     st.ID,
		Date:        in.Date,
		StartTime:   in.StartTime,
		EndTime:     in.EndTime,
		Title:       in.Title,
		Description: in.Description,
	}
	if in.Visit != nil {
		if typ.Name != Visit {
			return Slot{}, Type{}, domain.Invalid("訪問の情報は訪問の予定にだけ付けられます")
		}
		id, err := s.visits.Create(ctx, facilityID, *in.Visit)
		if err != nil {
			return Slot{}, Type{}, err
		}
		slot.VisitInfoID = &id
	}
	return slot, typ, nil
}
