package mysql

import (
	"context"
	"database/sql"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/infrastructure/mysql/sqlcgen"
)

// ScheduleRepository は、schedule.Repository を実装する。
type ScheduleRepository struct{ conn }

// NewScheduleRepository は ScheduleRepository を作る。
func NewScheduleRepository(db *sql.DB) *ScheduleRepository { return &ScheduleRepository{conn{db}} }

// GetType は、ID が id の予定の種類を返す。無いときは domain.ErrNotFound を返す。
func (r *ScheduleRepository) GetType(ctx context.Context, id string) (schedule.Type, error) {
	t, err := r.q(ctx).GetScheduleType(ctx, id)
	if err != nil {
		return schedule.Type{}, translate("get schedule type", err)
	}
	return schedule.Type{ID: t.ID, Name: schedule.TypeName(t.Name)}, nil
}

// ListTypes は、すべての予定の種類を名前、ID の順に返す。
func (r *ScheduleRepository) ListTypes(ctx context.Context) ([]schedule.Type, error) {
	rows, err := r.q(ctx).ListScheduleTypes(ctx)
	if err != nil {
		return nil, translate("list schedule types", err)
	}
	out := make([]schedule.Type, len(rows))
	for i, t := range rows {
		out[i] = schedule.Type{ID: t.ID, Name: schedule.TypeName(t.Name)}
	}
	return out, nil
}

// Create は、予定を書く。参照先（事業所、職員、予定の種類、繰り返しの予定、訪問の情報）が無いときは domain.ErrInvalidInput のエラーを返す。
func (r *ScheduleRepository) Create(ctx context.Context, s schedule.Schedule) error {
	err := r.q(ctx).CreateSchedule(ctx, sqlcgen.CreateScheduleParams{
		ID:                  s.ID,
		FacilityID:          s.FacilityID,
		StaffID:             s.StaffID,
		ScheduleTypeID:      s.TypeID,
		Date:                s.Date.Time(),
		StartTime:           timeOfDay(s.StartTime),
		EndTime:             timeOfDay(s.EndTime),
		RecurringScheduleID: nullString(s.RecurringScheduleID),
		VisitInfoID:         nullString(s.VisitInfoID),
		Title:               nullString(s.Title),
		Description:         nullString(s.Description),
		IsOverTimeWork:      s.IsOverTimeWork,
	})
	return translate("create schedule", err)
}

// Lock は、SELECT ... FOR UPDATE で予定の行に排他のロックを取る。予定が無いときは domain.ErrNotFound を返す。
// トランザクションの外で呼ぶと、ロックは文の終わりで外れる。
func (r *ScheduleRepository) Lock(ctx context.Context, id string) error {
	_, err := r.q(ctx).LockSchedule(ctx, id)
	return translate("lock schedule", err)
}

// Update は、ID が s.ID の予定の枠を s の値で上書きする。事業所と RecurringScheduleID は変えない。予定が無くてもエラーにしない。
func (r *ScheduleRepository) Update(ctx context.Context, s schedule.Schedule) error {
	err := r.q(ctx).UpdateSchedule(ctx, sqlcgen.UpdateScheduleParams{
		ID:             s.ID,
		StaffID:        s.StaffID,
		ScheduleTypeID: s.TypeID,
		Date:           s.Date.Time(),
		StartTime:      timeOfDay(s.StartTime),
		EndTime:        timeOfDay(s.EndTime),
		VisitInfoID:    nullString(s.VisitInfoID),
		Title:          nullString(s.Title),
		Description:    nullString(s.Description),
		IsOverTimeWork: s.IsOverTimeWork,
	})
	return translate("update schedule", err)
}

// Get は、ID が id の予定を、種類と職員の名前、訪問の情報と区分、キャンセルを付けて返す。無いときは domain.ErrNotFound を返す。
func (r *ScheduleRepository) Get(ctx context.Context, id string) (schedule.Detail, error) {
	row, err := r.q(ctx).GetScheduleDetail(ctx, id)
	if err != nil {
		return schedule.Detail{}, translate("get schedule", err)
	}
	out, err := r.scheduleDetails(ctx, []sqlcgen.ScheduleDetail{row})
	if err != nil {
		return schedule.Detail{}, err
	}
	return out[0], nil
}

// ListByFacility は、事業所 facilityID の予定のうち、q の種類と日付の範囲（両端を含む）に合うものを q.Sort の順（同じ値は ID の順）に返す。
func (r *ScheduleRepository) ListByFacility(ctx context.Context, facilityID string, q schedule.ListQuery) ([]schedule.Detail, error) {
	params := sqlcgen.ListScheduleDetailsByFacilityParams{
		FacilityID: facilityID,
		DateFrom:   nullDate(q.DateFrom),
		DateTo:     nullDate(q.DateTo),
		Sort:       q.Sort.Key(),
	}
	if q.TypeName != nil {
		params.ScheduleType = sql.NullString{String: string(*q.TypeName), Valid: true}
	}
	rows, err := r.q(ctx).ListScheduleDetailsByFacility(ctx, params)
	if err != nil {
		return nil, translate("list schedules", err)
	}
	return r.scheduleDetails(ctx, rows)
}

func (r *ScheduleRepository) scheduleDetails(ctx context.Context, rows []sqlcgen.ScheduleDetail) ([]schedule.Detail, error) {
	cats, err := r.visitCategories(ctx, visitInfoIDs(rows, func(s sqlcgen.ScheduleDetail) sql.NullString { return s.VisitInfoID }))
	if err != nil {
		return nil, err
	}
	out := make([]schedule.Detail, len(rows))
	for i, s := range rows {
		start, err := parseTimeOfDay(s.StartTime)
		if err != nil {
			return nil, err
		}
		end, err := parseTimeOfDay(s.EndTime)
		if err != nil {
			return nil, err
		}
		d := schedule.Detail{
			Schedule: schedule.Schedule{
				ID: s.ID,
				Slot: schedule.Slot{
					FacilityID:     s.FacilityID,
					StaffID:        s.StaffID,
					TypeID:         s.ScheduleTypeID,
					Date:           civil.DateOf(s.Date),
					StartTime:      start,
					EndTime:        end,
					VisitInfoID:    stringPtr(s.VisitInfoID),
					Title:          stringPtr(s.Title),
					Description:    stringPtr(s.Description),
					IsOverTimeWork: s.IsOverTimeWork,
				},
				RecurringScheduleID: stringPtr(s.RecurringScheduleID),
			},
			TypeName:  schedule.TypeName(s.ScheduleTypeName),
			StaffName: s.StaffName,
			Visit: visitDetailColumns{
				VisitInfoID: s.VisitInfoID, PatientID: s.PatientID, PatientName: s.PatientName,
				AssignedStaffID: s.AssignedStaffID, AssignedStaffName: s.AssignedStaffName,
				CompanionID: s.CompanionID, CompanionName: s.CompanionName,
				ServiceCodeID: s.ServiceCodeID, ServiceCode: s.ServiceCode,
			}.detail(cats),
			CreatedAt: s.CreatedAt,
			UpdatedAt: s.UpdatedAt,
		}
		if s.CancelID.Valid {
			d.Cancel = &schedule.Cancel{ID: s.CancelID.String, ScheduleID: s.ID, Reason: s.CancelReason.String}
		}
		out[i] = d
	}
	return out, nil
}

// CreateRecurring は、繰り返しの規則と予定を続けて書く。途中で失敗したときに残さないよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *ScheduleRepository) CreateRecurring(ctx context.Context, rs schedule.RecurringSchedule) error {
	params := sqlcgen.CreateRecurringRuleParams{
		ID:        rs.Rule.ID,
		Frequency: string(rs.Rule.Frequency),
		EndDate:   nullDate(rs.Rule.EndDate),
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
	q := r.q(ctx)
	if err := q.CreateRecurringRule(ctx, params); err != nil {
		return translate("create recurring rule", err)
	}
	err = q.CreateRecurringSchedule(ctx, sqlcgen.CreateRecurringScheduleParams{
		ID:              rs.ID,
		FacilityID:      rs.FacilityID,
		StaffID:         rs.StaffID,
		ScheduleTypeID:  rs.TypeID,
		RecurringRuleID: rs.Rule.ID,
		Date:            rs.Date.Time(),
		StartTime:       timeOfDay(rs.StartTime),
		EndTime:         timeOfDay(rs.EndTime),
		VisitInfoID:     nullString(rs.VisitInfoID),
		Title:           nullString(rs.Title),
		Description:     nullString(rs.Description),
		IsOverTimeWork:  rs.IsOverTimeWork,
	})
	return translate("create recurring schedule", err)
}

// GetRecurring は、ID が id の繰り返しの予定を、規則、除外する日付（日付の順）、訪問の情報を付けて返す。無いときは domain.ErrNotFound を返す。
func (r *ScheduleRepository) GetRecurring(ctx context.Context, id string) (schedule.RecurringDetail, error) {
	row, err := r.q(ctx).GetRecurringScheduleDetail(ctx, id)
	if err != nil {
		return schedule.RecurringDetail{}, translate("get recurring schedule", err)
	}
	out, err := r.recurringDetails(ctx, []sqlcgen.RecurringScheduleDetail{row})
	if err != nil {
		return schedule.RecurringDetail{}, err
	}
	return out[0], nil
}

// ListRecurringByFacility は、事業所 facilityID の繰り返しの予定のうち q の種類に合うものを q.Sort の順（同じ値は ID の順）に返す。
// q の日付の範囲は使わない。
func (r *ScheduleRepository) ListRecurringByFacility(ctx context.Context, facilityID string, q schedule.ListQuery) ([]schedule.RecurringDetail, error) {
	params := sqlcgen.ListRecurringScheduleDetailsByFacilityParams{FacilityID: facilityID, Sort: q.Sort.Key()}
	if q.TypeName != nil {
		params.ScheduleType = sql.NullString{String: string(*q.TypeName), Valid: true}
	}
	rows, err := r.q(ctx).ListRecurringScheduleDetailsByFacility(ctx, params)
	if err != nil {
		return nil, translate("list recurring schedules", err)
	}
	return r.recurringDetails(ctx, rows)
}

func (r *ScheduleRepository) recurringDetails(ctx context.Context, rows []sqlcgen.RecurringScheduleDetail) ([]schedule.RecurringDetail, error) {
	cats, err := r.visitCategories(ctx, visitInfoIDs(rows, func(s sqlcgen.RecurringScheduleDetail) sql.NullString { return s.VisitInfoID }))
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
	out := make([]schedule.RecurringDetail, len(rows))
	for i, s := range rows {
		start, err := parseTimeOfDay(s.StartTime)
		if err != nil {
			return nil, err
		}
		end, err := parseTimeOfDay(s.EndTime)
		if err != nil {
			return nil, err
		}
		ex := exclusions[s.ID]
		if ex == nil {
			ex = []civil.Date{}
		}
		out[i] = schedule.RecurringDetail{
			RecurringSchedule: schedule.RecurringSchedule{
				ID: s.ID,
				Slot: schedule.Slot{
					FacilityID:     s.FacilityID,
					StaffID:        s.StaffID,
					TypeID:         s.ScheduleTypeID,
					Date:           civil.DateOf(s.Date),
					StartTime:      start,
					EndTime:        end,
					VisitInfoID:    stringPtr(s.VisitInfoID),
					Title:          stringPtr(s.Title),
					Description:    stringPtr(s.Description),
					IsOverTimeWork: s.IsOverTimeWork,
				},
				Rule: schedule.Rule{
					ID:          s.RecurringRuleID,
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
			CreatedAt:      s.CreatedAt,
			UpdatedAt:      s.UpdatedAt,
		}
	}
	return out, nil
}

// AddExclusion は、繰り返しの予定 recurringScheduleID から日付 d を除く。同じ日付をすでに除いているときは domain.ErrConflict を、
// 繰り返しの予定が無いときは domain.ErrInvalidInput のエラーを返す。
func (r *ScheduleRepository) AddExclusion(ctx context.Context, recurringScheduleID string, d civil.Date) error {
	err := r.q(ctx).AddRecurringScheduleExclusion(ctx, sqlcgen.AddRecurringScheduleExclusionParams{
		RecurringScheduleID: recurringScheduleID, Date: d.Time(),
	})
	return translate("add recurring schedule exclusion", err)
}

// CreateCancel は、予定のキャンセルを書く。キャンセル済みのときは domain.ErrConflict を、予定が無いときは domain.ErrInvalidInput のエラーを返す。
func (r *ScheduleRepository) CreateCancel(ctx context.Context, c schedule.Cancel) error {
	err := r.q(ctx).CreateScheduleCancel(ctx, sqlcgen.CreateScheduleCancelParams{
		ID: c.ID, ScheduleID: c.ScheduleID, Reason: c.Reason,
	})
	return translate("create schedule cancel", err)
}

func visitInfoIDs[T any](rows []T, id func(T) sql.NullString) []string {
	var ids []string
	for _, r := range rows {
		if v := id(r); v.Valid {
			ids = append(ids, v.String)
		}
	}
	return ids
}
