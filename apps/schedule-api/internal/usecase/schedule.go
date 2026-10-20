package usecase

import (
	"context"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

// ScheduleRepositories は、Schedules が使うリポジトリである。
type ScheduleRepositories struct {
	Facilities organization.FacilityRepository
	Staff      staff.Repository
	Patients   patient.Repository
	Visits     visit.Repository
	Schedules  schedule.Repository
}

// Schedules は、予定の操作である。
type Schedules struct {
	repos  ScheduleRepositories
	tx     domain.Transactor
	ids    domain.IDGenerator
	visits visitWriter
}

// NewSchedules は Schedules を作る。
func NewSchedules(repos ScheduleRepositories, tx domain.Transactor, ids domain.IDGenerator) *Schedules {
	return &Schedules{
		repos: repos,
		tx:    tx,
		ids:   ids,
		visits: visitWriter{
			staff:    repos.Staff,
			patients: repos.Patients,
			visits:   repos.Visits,
			ids:      ids,
		},
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
	Visit       *VisitInput
}

// RuleInput は、繰り返しの規則の入力である。
type RuleInput struct {
	Frequency   schedule.Frequency
	DayOfWeek   *int
	DayOfMonth  *int
	WeekOfMonth *int
	EndDate     *civil.Date
}

// List は、事業所の単発の予定と繰り返しの予定である。
type List struct {
	Schedules          []schedule.Detail
	RecurringSchedules []schedule.RecurringDetail
}

// ListTypes は、予定の種類を返す。
func (s *Schedules) ListTypes(ctx context.Context) ([]schedule.Type, error) {
	return s.repos.Schedules.ListTypes(ctx)
}

// Get は、単発の予定を返す。
func (s *Schedules) Get(ctx context.Context, id string) (schedule.Detail, error) {
	return s.repos.Schedules.Get(ctx, id)
}

// GetRecurring は、繰り返しの予定を返す。
func (s *Schedules) GetRecurring(ctx context.Context, id string) (schedule.RecurringDetail, error) {
	return s.repos.Schedules.GetRecurring(ctx, id)
}

// List は、事業所の予定を返す。事業所が見つからないときは domain.ErrNotFound を返す。
func (s *Schedules) List(ctx context.Context, facilityID string, q schedule.ListQuery) (List, error) {
	if err := q.Validate(); err != nil {
		return List{}, err
	}
	if _, err := s.repos.Facilities.Get(ctx, facilityID); err != nil {
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
	return List{Schedules: single, RecurringSchedules: recurring}, nil
}

// Create は、事業所に単発の予定を作る。訪問の情報があれば同じトランザクションで保存する。
// 事業所が見つからないときは domain.ErrNotFound を、参照が見つからないか別の事業所のものであるときは入力の誤りを返す。
func (s *Schedules) Create(ctx context.Context, facilityID string, in SlotInput) (schedule.Detail, error) {
	if _, err := s.repos.Facilities.Get(ctx, facilityID); err != nil {
		return schedule.Detail{}, err
	}
	var created schedule.Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		created, err = s.createSchedule(ctx, facilityID, in, nil)
		return err
	})
	return created, err
}

// CreateRecurring は、事業所に繰り返しの予定を作る。エラーは Create と同じである。
func (s *Schedules) CreateRecurring(ctx context.Context, facilityID string, in SlotInput, rule RuleInput) (schedule.RecurringDetail, error) {
	if _, err := s.repos.Facilities.Get(ctx, facilityID); err != nil {
		return schedule.RecurringDetail{}, err
	}
	r, err := schedule.NewRule(schedule.Rule{
		ID:          s.ids.NewID(),
		Frequency:   rule.Frequency,
		DayOfWeek:   rule.DayOfWeek,
		DayOfMonth:  rule.DayOfMonth,
		WeekOfMonth: rule.WeekOfMonth,
		EndDate:     rule.EndDate,
	})
	if err != nil {
		return schedule.RecurringDetail{}, err
	}
	var created schedule.RecurringDetail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		slot, typ, err := s.prepareSlot(ctx, facilityID, in)
		if err != nil {
			return err
		}
		rs, err := schedule.NewRecurring(s.ids.NewID(), slot, typ, r)
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
func (s *Schedules) ChangeOccurrence(ctx context.Context, recurringScheduleID string, originalDate civil.Date, in SlotInput) (schedule.Detail, error) {
	rs, err := s.repos.Schedules.GetRecurring(ctx, recurringScheduleID)
	if err != nil {
		return schedule.Detail{}, err
	}
	if !rs.Occurs(originalDate) {
		return schedule.Detail{}, domain.Invalid("%s は繰り返しの予定の回に当たりません", originalDate)
	}
	var created schedule.Detail
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
func (s *Schedules) Cancel(ctx context.Context, scheduleID, reason string) (schedule.Cancel, error) {
	if _, err := s.repos.Schedules.Get(ctx, scheduleID); err != nil {
		return schedule.Cancel{}, err
	}
	c, err := schedule.NewCancel(s.ids.NewID(), scheduleID, reason)
	if err != nil {
		return schedule.Cancel{}, err
	}
	if err := s.repos.Schedules.CreateCancel(ctx, c); err != nil {
		return schedule.Cancel{}, err
	}
	return c, nil
}

func (s *Schedules) createSchedule(ctx context.Context, facilityID string, in SlotInput, recurringScheduleID *string) (schedule.Detail, error) {
	slot, typ, err := s.prepareSlot(ctx, facilityID, in)
	if err != nil {
		return schedule.Detail{}, err
	}
	sc, err := schedule.New(s.ids.NewID(), slot, typ)
	if err != nil {
		return schedule.Detail{}, err
	}
	sc.RecurringScheduleID = recurringScheduleID
	if err := s.repos.Schedules.Create(ctx, sc); err != nil {
		return schedule.Detail{}, err
	}
	return s.repos.Schedules.Get(ctx, sc.ID)
}

// prepareSlot は、予定の種類と職員を確かめ、訪問の情報があれば保存して、予定の属性を組み立てる。
// 訪問の情報を保存するので、トランザクションの中で呼ぶ。
func (s *Schedules) prepareSlot(ctx context.Context, facilityID string, in SlotInput) (schedule.Slot, schedule.Type, error) {
	typ, err := s.repos.Schedules.GetType(ctx, in.TypeID)
	if err != nil {
		return schedule.Slot{}, schedule.Type{}, reference("予定の種類", in.TypeID, err)
	}
	st, err := s.repos.Staff.Get(ctx, in.StaffID)
	if err != nil {
		return schedule.Slot{}, schedule.Type{}, reference("職員", in.StaffID, err)
	}
	if err := sameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
		return schedule.Slot{}, schedule.Type{}, err
	}
	slot := schedule.Slot{
		FacilityID:  facilityID,
		StaffID:     st.ID,
		Date:        in.Date,
		StartTime:   in.StartTime,
		EndTime:     in.EndTime,
		Title:       in.Title,
		Description: in.Description,
	}
	if in.Visit != nil {
		if typ.Name != schedule.Visit {
			return schedule.Slot{}, schedule.Type{}, domain.Invalid("訪問の情報は訪問の予定にだけ付けられます")
		}
		id, err := s.visits.create(ctx, facilityID, *in.Visit)
		if err != nil {
			return schedule.Slot{}, schedule.Type{}, err
		}
		slot.VisitInfoID = &id
	}
	return slot, typ, nil
}
