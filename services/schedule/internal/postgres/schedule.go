package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// ScheduleTypeRepository は、schedule.TypeRepository を実装する。
type ScheduleTypeRepository struct{ conn }

// NewScheduleTypeRepository は ScheduleTypeRepository を作る。
func NewScheduleTypeRepository(pool *pgxpool.Pool) *ScheduleTypeRepository {
	return &ScheduleTypeRepository{conn{pool}}
}

// Get は、ID が id の予定の種類を返す。無いときは apperr.ErrNotFound を返す。
func (r *ScheduleTypeRepository) Get(ctx context.Context, id string) (schedule.Type, error) {
	t, err := r.q(ctx).GetScheduleType(ctx, id)
	if err != nil {
		return schedule.Type{}, translate("get schedule type", err)
	}
	return toScheduleType(t), nil
}

// List は、すべての予定の種類を名前、ID の順に返す。
func (r *ScheduleTypeRepository) List(ctx context.Context) ([]schedule.Type, error) {
	rows, err := r.q(ctx).ListScheduleTypes(ctx)
	if err != nil {
		return nil, translate("list schedule types", err)
	}
	out := make([]schedule.Type, len(rows))
	for i, t := range rows {
		out[i] = toScheduleType(t)
	}
	return out, nil
}

func toScheduleType(t sqlcgen.ScheduleType) schedule.Type {
	return schedule.Type{ID: t.ID, Code: schedule.TypeCode(t.Code), Name: schedule.TypeName(t.Name)}
}

// ScheduleRepository は、schedule.Repository と scheduleview.Schedules を実装する。
type ScheduleRepository struct{ conn }

// NewScheduleRepository は ScheduleRepository を作る。
func NewScheduleRepository(pool *pgxpool.Pool) *ScheduleRepository {
	return &ScheduleRepository{conn{pool}}
}

// Create は、予定を書く。IsOverTimeWork は書かず、DB が開始の時刻から生成する。参照先（事業所、職員、予定の種類、繰り返しの予定、訪問の情報）が無いか、値がカラムの制約に合わないときは apperr.ErrInvalidInput のエラーを返す。
func (r *ScheduleRepository) Create(ctx context.Context, s schedule.Schedule) error {
	err := r.q(ctx).CreateSchedule(ctx, sqlcgen.CreateScheduleParams{
		ID:                  s.ID,
		FacilityID:          s.FacilityID,
		StaffID:             s.StaffID,
		ScheduleTypeID:      s.TypeID,
		Date:                s.Date.Time(),
		StartTime:           timeOfDay(s.StartTime),
		EndTime:             timeOfDay(s.EndTime),
		EndsNextDay:         s.EndsNextDay,
		RecurringScheduleID: s.RecurringScheduleID,
		OriginalDate:        nullDate(s.OriginalDate),
		VisitInfoID:         s.VisitInfoID,
		Title:               s.Title,
		Description:         s.Description,
	})
	return translate("create schedule", err)
}

// GetForUpdate は、トランザクションの終わりまで予定の行に排他のロックを取ってから、名前を結合しない予定を返す。
// 予定が無いときは apperr.ErrNotFound を返す。トランザクションの中で呼ぶ。
func (r *ScheduleRepository) GetForUpdate(ctx context.Context, id string) (schedule.Stored, error) {
	if _, err := r.q(ctx).LockSchedule(ctx, id); err != nil {
		return schedule.Stored{}, translate("lock schedule", err)
	}
	return r.stored(ctx, id)
}

// ReplacementOf は、繰り返しの予定 recurringScheduleID の d の回を置き換えた単発の予定を、名前を結合せずに返す。
// 無いときは apperr.ErrNotFound を返す。
func (r *ScheduleRepository) ReplacementOf(ctx context.Context, recurringScheduleID string, d civil.Date) (schedule.Stored, error) {
	id, err := r.q(ctx).GetReplacingScheduleID(ctx, sqlcgen.GetReplacingScheduleIDParams{
		RecurringScheduleID: &recurringScheduleID, OriginalDate: ptr(d.Time()),
	})
	if err != nil {
		return schedule.Stored{}, translate("get replacing schedule", err)
	}
	return r.stored(ctx, id)
}

// stored は、ID が id の予定を、訪問の情報の ID とキャンセルの有無を付けて返す。名前は結合しない。
func (r *ScheduleRepository) stored(ctx context.Context, id string) (schedule.Stored, error) {
	s, err := r.q(ctx).GetStoredSchedule(ctx, id)
	if err != nil {
		return schedule.Stored{}, translate("get stored schedule", err)
	}
	start, end, err := slotTimes(s.StartTime, s.EndTime)
	if err != nil {
		return schedule.Stored{}, err
	}
	v, err := r.storedVisit(ctx, s.FacilityID, s.VisitInfoID, s.PatientID, s.AssignedStaffID, s.CompanionID, s.ServiceCodeID)
	if err != nil {
		return schedule.Stored{}, err
	}
	return schedule.Stored{
		Schedule: schedule.Schedule{
			ID: s.ID,
			Slot: schedule.Slot{
				FacilityID:     s.FacilityID,
				StaffID:        s.StaffID,
				TypeID:         s.ScheduleTypeID,
				Date:           civil.DateOf(s.Date),
				StartTime:      start,
				EndTime:        end,
				EndsNextDay:    s.EndsNextDay,
				VisitInfoID:    s.VisitInfoID,
				Title:          s.Title,
				Description:    s.Description,
				IsOverTimeWork: s.IsOverTimeWork,
			},
			RecurringScheduleID: s.RecurringScheduleID,
			OriginalDate:        datePtr(s.OriginalDate),
		},
		Visit:     v,
		Cancelled: s.Cancelled,
		Version:   int(s.Version),
	}, nil
}

// storedVisit は、訪問の情報 visitInfoID を、区分の ID を付けて返す。訪問の情報が無い予定なら nil を返す。
func (c conn) storedVisit(ctx context.Context, facilityID string, visitInfoID, patientID, assignedStaffID, companionID, serviceCodeID *string) (*visit.Info, error) {
	if visitInfoID == nil {
		return nil, nil
	}
	cats, err := c.q(ctx).ListVisitInfoCategoryIDs(ctx, *visitInfoID)
	if err != nil {
		return nil, translate("list visit info category ids", err)
	}
	return &visit.Info{
		ID: *visitInfoID, FacilityID: facilityID, PatientID: deref(patientID), AssignedStaffID: deref(assignedStaffID),
		CompanionID: companionID, ServiceCodeID: deref(serviceCodeID), CategoryIDs: cats,
	}, nil
}

// Update は、ID が s.ID の予定の枠を s の値で上書きする。事業所と、RecurringScheduleID と OriginalDate は変えない。予定が無くてもエラーにしない。
// 参照先（職員、予定の種類、訪問の情報）が無いか、値がカラムの制約に合わないときは apperr.ErrInvalidInput のエラーを返す。
func (r *ScheduleRepository) Update(ctx context.Context, s schedule.Schedule) error {
	err := r.q(ctx).UpdateSchedule(ctx, sqlcgen.UpdateScheduleParams{
		ID:             s.ID,
		StaffID:        s.StaffID,
		ScheduleTypeID: s.TypeID,
		Date:           s.Date.Time(),
		StartTime:      timeOfDay(s.StartTime),
		EndTime:        timeOfDay(s.EndTime),
		EndsNextDay:    s.EndsNextDay,
		VisitInfoID:    s.VisitInfoID,
		Title:          s.Title,
		Description:    s.Description,
	})
	return translate("update schedule", err)
}

// Get は、ID が id の予定を、種類と職員の名前、訪問の情報と区分、キャンセルを付けて返す。無いときは apperr.ErrNotFound を返す。
func (r *ScheduleRepository) Get(ctx context.Context, id string) (scheduleview.Detail, error) {
	row, err := r.q(ctx).GetScheduleDetail(ctx, id)
	if err != nil {
		return scheduleview.Detail{}, translate("get schedule", err)
	}
	out, err := r.scheduleDetails(ctx, []sqlcgen.ScheduleDetail{row})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	return out[0], nil
}

// ListByFacility は、事業所 facilityID の予定のうち、q の種類と日付の範囲（両端を含む）に合うものを q.Sort の順に返す。
// q.DateFrom の前の日に始まり、終了が翌日の予定も返す。
// 日付の順では、同じ日付を開始時刻、ID の順に並べる。ほかの順では、同じ値を ID の順に並べる。
func (r *ScheduleRepository) ListByFacility(ctx context.Context, facilityID string, q scheduleview.ListQuery) ([]scheduleview.Detail, error) {
	params := sqlcgen.ListScheduleDetailsByFacilityParams{
		FacilityID: facilityID,
		DateFrom:   nullDate(q.DateFrom),
		DateTo:     nullDate(q.DateTo),
		Sort:       q.Sort.Key(),
	}
	if q.TypeName != nil {
		params.ScheduleType = ptr(string(*q.TypeName))
	}
	rows, err := r.q(ctx).ListScheduleDetailsByFacility(ctx, params)
	if err != nil {
		return nil, translate("list schedules", err)
	}
	return r.scheduleDetails(ctx, rows)
}

func (r *ScheduleRepository) scheduleDetails(ctx context.Context, rows []sqlcgen.ScheduleDetail) ([]scheduleview.Detail, error) {
	cats, err := r.visitCategories(ctx, visitInfoIDs(rows, func(s sqlcgen.ScheduleDetail) *string { return s.VisitInfoID }))
	if err != nil {
		return nil, err
	}
	out := make([]scheduleview.Detail, len(rows))
	for i, s := range rows {
		start, end, err := slotTimes(s.StartTime, s.EndTime)
		if err != nil {
			return nil, err
		}
		d := scheduleview.Detail{
			Schedule: schedule.Schedule{
				ID: s.ID,
				Slot: schedule.Slot{
					FacilityID:     s.FacilityID,
					StaffID:        s.StaffID,
					TypeID:         s.ScheduleTypeID,
					Date:           civil.DateOf(s.Date),
					StartTime:      start,
					EndTime:        end,
					EndsNextDay:    s.EndsNextDay,
					VisitInfoID:    s.VisitInfoID,
					Title:          s.Title,
					Description:    s.Description,
					IsOverTimeWork: s.IsOverTimeWork,
				},
				RecurringScheduleID: s.RecurringScheduleID,
				OriginalDate:        datePtr(s.OriginalDate),
			},
			TypeName:  schedule.TypeName(s.ScheduleTypeName),
			StaffName: s.StaffName,
			Visit: visitDetailColumns{
				VisitInfoID: s.VisitInfoID, PatientID: s.PatientID, PatientName: s.PatientName,
				AssignedStaffID: s.AssignedStaffID, AssignedStaffName: s.AssignedStaffName,
				CompanionID: s.CompanionID, CompanionName: s.CompanionName,
				ServiceCodeID: s.ServiceCodeID, ServiceCode: s.ServiceCode,
			}.detail(cats),
			Version:   int(s.Version),
			CreatedAt: s.CreatedAt,
			UpdatedAt: s.UpdatedAt,
		}
		if s.CancelID != nil {
			d.Cancel = &schedule.Cancellation{ID: *s.CancelID, ScheduleID: s.ID, Reason: deref(s.CancelReason)}
		}
		out[i] = d
	}
	return out, nil
}

// CreateCancel は、予定のキャンセルを書き、予定の更新の番号を 1 つ増やす。キャンセル済みのときは apperr.ErrConflict を、
// 予定が無いときは apperr.ErrInvalidInput のエラーを返す。2 つの書き込みを揃えるため、トランザクションの中で呼ぶ。
func (r *ScheduleRepository) CreateCancel(ctx context.Context, c schedule.Cancellation) error {
	err := r.q(ctx).CreateScheduleCancel(ctx, sqlcgen.CreateScheduleCancelParams{
		ID: c.ID, ScheduleID: c.ScheduleID, Reason: c.Reason,
	})
	if err != nil {
		return translate("create schedule cancel", err)
	}
	return translate("bump schedule version", r.q(ctx).BumpScheduleVersion(ctx, c.ScheduleID))
}

// RecurringScheduleRepository は、schedule.RecurringRepository と scheduleview.RecurringSchedules を実装する。
type RecurringScheduleRepository struct{ conn }

// NewRecurringScheduleRepository は RecurringScheduleRepository を作る。
func NewRecurringScheduleRepository(pool *pgxpool.Pool) *RecurringScheduleRepository {
	return &RecurringScheduleRepository{conn{pool}}
}

// Create は、繰り返しの予定と規則を 1 つのレコードに書く。IsOverTimeWork は書かず、DB が開始の時刻から生成する。
// 参照先が無いか、値がカラムの制約に合わないときは apperr.ErrInvalidInput のエラーを返す。
func (r *RecurringScheduleRepository) Create(ctx context.Context, rs schedule.RecurringSchedule) error {
	params := sqlcgen.CreateRecurringScheduleParams{
		ID:             rs.ID,
		FacilityID:     rs.FacilityID,
		StaffID:        rs.StaffID,
		ScheduleTypeID: rs.TypeID,
		Date:           rs.Date.Time(),
		StartTime:      timeOfDay(rs.StartTime),
		EndTime:        timeOfDay(rs.EndTime),
		EndsNextDay:    rs.EndsNextDay,
		VisitInfoID:    rs.VisitInfoID,
		Title:          rs.Title,
		Description:    rs.Description,
		Frequency:      string(rs.Rule.Frequency),
		EndDate:        nullDate(rs.Rule.EndDate),
	}
	var err error
	if params.DayOfWeek, err = nullInt16(rs.Rule.DayOfWeek); err != nil {
		return err
	}
	if params.DayOfMonth, err = nullInt16(rs.Rule.DayOfMonth); err != nil {
		return err
	}
	if params.WeekOfMonth, err = nullInt16(rs.Rule.WeekOfMonth); err != nil {
		return err
	}
	return translate("create recurring schedule", r.q(ctx).CreateRecurringSchedule(ctx, params))
}

// GetForUpdate は、トランザクションの終わりまで繰り返しの予定の行に排他のロックを取ってから、名前を結合しない繰り返しの予定を返す。
// 繰り返しの予定が無いときは apperr.ErrNotFound を返す。トランザクションの中で呼ぶ。
func (r *RecurringScheduleRepository) GetForUpdate(ctx context.Context, id string) (schedule.StoredRecurring, error) {
	if _, err := r.q(ctx).LockRecurringSchedule(ctx, id); err != nil {
		return schedule.StoredRecurring{}, translate("lock recurring schedule", err)
	}
	s, err := r.q(ctx).GetStoredRecurringSchedule(ctx, id)
	if err != nil {
		return schedule.StoredRecurring{}, translate("get stored recurring schedule", err)
	}
	start, end, err := slotTimes(s.StartTime, s.EndTime)
	if err != nil {
		return schedule.StoredRecurring{}, err
	}
	v, err := r.storedVisit(ctx, s.FacilityID, s.VisitInfoID, s.PatientID, s.AssignedStaffID, s.CompanionID, s.ServiceCodeID)
	if err != nil {
		return schedule.StoredRecurring{}, err
	}
	return schedule.StoredRecurring{
		RecurringSchedule: schedule.RecurringSchedule{
			ID: s.ID,
			Slot: schedule.Slot{
				FacilityID:     s.FacilityID,
				StaffID:        s.StaffID,
				TypeID:         s.ScheduleTypeID,
				Date:           civil.DateOf(s.Date),
				StartTime:      start,
				EndTime:        end,
				EndsNextDay:    s.EndsNextDay,
				VisitInfoID:    s.VisitInfoID,
				Title:          s.Title,
				Description:    s.Description,
				IsOverTimeWork: s.IsOverTimeWork,
			},
			Rule: schedule.Rule{
				Frequency:   schedule.Frequency(s.Frequency),
				DayOfWeek:   intPtr(s.DayOfWeek),
				DayOfMonth:  intPtr(s.DayOfMonth),
				WeekOfMonth: intPtr(s.WeekOfMonth),
				EndDate:     datePtr(s.EndDate),
			},
		},
		Visit:   v,
		Version: int(s.Version),
	}, nil
}

// Get は、ID が id の繰り返しの予定を、種類と職員の名前、規則、除外する日付（日付の順）、訪問の情報と区分を付けて返す。無いときは apperr.ErrNotFound を返す。
func (r *RecurringScheduleRepository) Get(ctx context.Context, id string) (scheduleview.RecurringDetail, error) {
	row, err := r.q(ctx).GetRecurringScheduleDetail(ctx, id)
	if err != nil {
		return scheduleview.RecurringDetail{}, translate("get recurring schedule", err)
	}
	out, err := r.recurringDetails(ctx, []sqlcgen.RecurringScheduleDetail{row})
	if err != nil {
		return scheduleview.RecurringDetail{}, err
	}
	return out[0], nil
}

// ListByFacility は、事業所 facilityID の繰り返しの予定のうち q の種類に合うものを q.Sort の順に返す。
// 日付の順では、同じ日付を開始時刻、ID の順に並べる。ほかの順では、同じ値を ID の順に並べる。
// q の日付の範囲は使わない。
func (r *RecurringScheduleRepository) ListByFacility(ctx context.Context, facilityID string, q scheduleview.ListQuery) ([]scheduleview.RecurringDetail, error) {
	params := sqlcgen.ListRecurringScheduleDetailsByFacilityParams{FacilityID: facilityID, Sort: q.Sort.Key()}
	if q.TypeName != nil {
		params.ScheduleType = ptr(string(*q.TypeName))
	}
	rows, err := r.q(ctx).ListRecurringScheduleDetailsByFacility(ctx, params)
	if err != nil {
		return nil, translate("list recurring schedules", err)
	}
	return r.recurringDetails(ctx, rows)
}

func (r *RecurringScheduleRepository) recurringDetails(ctx context.Context, rows []sqlcgen.RecurringScheduleDetail) ([]scheduleview.RecurringDetail, error) {
	cats, err := r.visitCategories(ctx, visitInfoIDs(rows, func(s sqlcgen.RecurringScheduleDetail) *string { return s.VisitInfoID }))
	if err != nil {
		return nil, err
	}
	exclusions := make(map[string][]civil.Date)
	if len(rows) > 0 {
		ids := make([]string, len(rows))
		for i, rs := range rows {
			ids[i] = rs.ID
		}
		ex, err := r.q(ctx).ListRecurringScheduleExclusions(ctx, ids)
		if err != nil {
			return nil, translate("list recurring schedule exclusions", err)
		}
		for _, e := range ex {
			exclusions[e.RecurringScheduleID] = append(exclusions[e.RecurringScheduleID], civil.DateOf(e.Date))
		}
	}
	out := make([]scheduleview.RecurringDetail, len(rows))
	for i, s := range rows {
		start, end, err := slotTimes(s.StartTime, s.EndTime)
		if err != nil {
			return nil, err
		}
		ex := exclusions[s.ID]
		if ex == nil {
			ex = []civil.Date{}
		}
		out[i] = scheduleview.RecurringDetail{
			RecurringSchedule: schedule.RecurringSchedule{
				ID: s.ID,
				Slot: schedule.Slot{
					FacilityID:     s.FacilityID,
					StaffID:        s.StaffID,
					TypeID:         s.ScheduleTypeID,
					Date:           civil.DateOf(s.Date),
					StartTime:      start,
					EndTime:        end,
					EndsNextDay:    s.EndsNextDay,
					VisitInfoID:    s.VisitInfoID,
					Title:          s.Title,
					Description:    s.Description,
					IsOverTimeWork: s.IsOverTimeWork,
				},
				Rule: schedule.Rule{
					Frequency:   schedule.Frequency(s.Frequency),
					DayOfWeek:   intPtr(s.DayOfWeek),
					DayOfMonth:  intPtr(s.DayOfMonth),
					WeekOfMonth: intPtr(s.WeekOfMonth),
					EndDate:     datePtr(s.EndDate),
				},
			},
			TypeName:  schedule.TypeName(s.ScheduleTypeName),
			StaffName: s.StaffName,
			Visit: visitDetailColumns{
				VisitInfoID: s.VisitInfoID, PatientID: s.PatientID, PatientName: s.PatientName,
				AssignedStaffID: s.AssignedStaffID, AssignedStaffName: s.AssignedStaffName,
				CompanionID: s.CompanionID, CompanionName: s.CompanionName,
				ServiceCodeID: s.ServiceCodeID, ServiceCode: s.ServiceCode,
			}.detail(cats),
			ExclusionDates: ex,
			Version:        int(s.Version),
			CreatedAt:      s.CreatedAt,
			UpdatedAt:      s.UpdatedAt,
		}
	}
	return out, nil
}

// AddExclusion は、繰り返しの予定 recurringScheduleID から日付 d を除く。同じ日付をすでに除いているときは apperr.ErrConflict を、
// 繰り返しの予定が無いときは apperr.ErrInvalidInput のエラーを返す。
func (r *RecurringScheduleRepository) AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error {
	err := r.q(ctx).AddRecurringScheduleExclusion(ctx, sqlcgen.AddRecurringScheduleExclusionParams{
		RecurringScheduleID: recurringScheduleID, Date: d.Time(),
	})
	if err != nil {
		return translate("add recurring schedule exclusion", err)
	}
	return translate("bump recurring schedule version", r.q(ctx).BumpRecurringScheduleVersion(ctx, recurringScheduleID))
}

func visitInfoIDs[T any](rows []T, id func(T) *string) []string {
	var ids []string
	for _, r := range rows {
		if v := id(r); v != nil {
			ids = append(ids, *v)
		}
	}
	return ids
}
