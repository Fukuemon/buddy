package mysql

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

// seed.sql の ID。
const (
	seedFacility      = "01M3TC5H00QV17BC0J9V3393ZP"
	seedDepartment    = "01M3TC5HZ8A18D2TP3PTKDXJMN"
	seedTeam          = "01M3TC5KXRSEVXQZ2MTJK9FS45"
	seedLeader        = "01M3TC5PVG7W2H1H20W0T1ZVEJ"
	seedViewPolicy    = "01M3TC5RT0NESA2F5D3RWF1X0K"
	seedEditPolicy    = "01M3TC5SS84XD3DCR2D63H1V24"
	seedAoki          = "01M3TC5TRG5200KYWTZW6ER3WN"
	seedMori          = "01M3TC5VQR3MKFF9AA4BVKF44Z"
	seedHayashi       = "01M3TC5WQ08KWBZX85WAZ1C4N7"
	seedPatient       = "01M3TC66FGZVK39Y7GRVZSGWS1"
	seedServiceCode   = "01M3TC60M0XC173N54CJQRKFVR"
	seedEmergency     = "01M3TC64H0JJHBDMJQPGBX9FM7"
	seedNight         = "01M3TC63HR6H7CP0CVRZGED7BB"
	seedNormalType    = "01M3TC68E05E1N46YCCBT6ZQB2"
	seedVisitType     = "01M3TC69D8KB2938F3GS7WBVT5"
	seedConference    = "01M3TC6BBRBQM0QK0S43P56AFH"
	seedVisitSchedule = "01M3TC6CB064BZXJVJBCC4ZSY5"
	seedRecurring     = "01M3TC6E9G4N8Q2R5T7V9W1X3Y"
	unknownID         = "01M3TCZZZZZZZZZZZZZZZZZZZZ"
)

func ptr[T any](v T) *T { return &v }

func TestFacilityGet(t *testing.T) {
	ctx := txContext(t)
	r := NewFacilityRepository(testDB)
	f, err := r.Get(ctx, seedFacility)
	if err != nil {
		t.Fatal(err)
	}
	if f.Name != "サンプル訪問看護ステーション" || f.CreatedAt.IsZero() {
		t.Errorf("got %+v", f)
	}
	if _, err := r.Get(ctx, unknownID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestFacilityGetByOrgID(t *testing.T) {
	ctx := txContext(t)
	r := NewFacilityRepository(testDB)
	f, err := r.GetByOrgID(ctx, "org-sample")
	if err != nil {
		t.Fatal(err)
	}
	if f.ID != seedFacility {
		t.Errorf("got %+v", f)
	}
	if _, err := r.GetByOrgID(ctx, "org-unknown"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestPositionCreateAndGet(t *testing.T) {
	ctx := txContext(t)
	r := NewPositionRepository(testDB)
	p := organization.Position{
		ID: "01M3TD00000000000000000001", FacilityID: seedFacility, Name: "主任",
		Policies: []organization.Policy{{ID: seedViewPolicy}, {ID: seedEditPolicy}},
	}
	if err := r.Create(ctx, p); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Policies) != 2 {
		t.Errorf("Policies = %+v", got.Policies)
	}
	dup := p
	dup.ID = "01M3TD00000000000000000002"
	dup.Policies = nil
	if err := r.Create(ctx, dup); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("同じ名前の役職: err = %v, want ErrConflict", err)
	}
	list, err := r.ListByFacility(ctx, seedFacility)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 4 {
		t.Errorf("役職 = %d 件", len(list))
	}
}

func TestStaffGetWithPolicies(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	got, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	if got.PositionName != "リーダー" || got.TeamName != "B" || got.Sub != nil {
		t.Errorf("got %+v", got.Summary)
	}
	if len(got.Policies) != 1 || got.Policies[0].PolicyID != seedViewPolicy ||
		!slices.Equal(got.Policies[0].TargetUserIDs, []string{seedHayashi}) {
		t.Errorf("Policies = %+v", got.Policies)
	}
	if _, err := r.Get(ctx, unknownID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestStaffLinkSub(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	if err := r.LinkSub(ctx, unknownID, "hina.aoki@example.com", "sub-other-facility"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.FindIDBySub(ctx, "sub-other-facility"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("ほかの事業所の指定で結び付けた: err = %v", err)
	}
	if err := r.LinkSub(ctx, seedFacility, "hina.aoki@example.com", "sub-1"); err != nil {
		t.Fatal(err)
	}
	if id, err := r.FindIDBySub(ctx, "sub-1"); err != nil || id != seedAoki {
		t.Fatalf("id = %q, err = %v", id, err)
	}
	if err := r.LinkSub(ctx, seedFacility, "hina.aoki@example.com", "sub-2"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.FindIDBySub(ctx, "sub-2"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("結び付け済みの sub を書き換えた: err = %v", err)
	}
}

// TestStaffLinkSubConcurrent は、トランザクションの外で同時に結び付け、書かれた sub が 1 つだけであることを確かめる。
func TestStaffLinkSubConcurrent(t *testing.T) {
	if testDB == nil {
		t.Skip("MySQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	t.Cleanup(func() {
		if _, err := testDB.ExecContext(ctx, "UPDATE users SET sub = NULL WHERE id = ?", seedHayashi); err != nil {
			t.Error(err)
		}
	})
	r := NewStaffRepository(testDB)
	subs := []string{"sub-a", "sub-b", "sub-c", "sub-d"}
	errs := make(chan error, len(subs))
	for _, sub := range subs {
		go func() { errs <- r.LinkSub(ctx, seedFacility, "sakura.hayashi@example.com", sub) }()
	}
	for range subs {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	found := 0
	for _, sub := range subs {
		if id, err := r.FindIDBySub(ctx, sub); err == nil && id == seedHayashi {
			found++
		}
	}
	if found != 1 {
		t.Fatalf("結び付いた sub = %d 個, want 1", found)
	}
}

func TestStaffCreate(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	s := staff.Staff{
		ID: "01M3TD00000000000000000010", Username: "新人 一花", Email: "ichika@example.com",
		PhoneNumber: ptr("+09000000000"), FacilityID: seedFacility,
		DepartmentID: seedDepartment, TeamID: seedTeam, PositionID: seedLeader,
	}
	if err := r.Create(ctx, s, []staff.Grant{{ID: "01M3TD00000000000000000011", PolicyID: seedViewPolicy}}); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.PhoneNumber == nil || *got.PhoneNumber != "+09000000000" || len(got.Policies) != 1 {
		t.Errorf("got %+v", got)
	}
	dup := s
	dup.ID = "01M3TD00000000000000000012"
	dup.Username = "別の名前"
	if err := r.Create(ctx, dup, nil); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("同じメール: err = %v, want ErrConflict", err)
	}
	bad := s
	bad.ID, bad.Username, bad.Email, bad.TeamID = "01M3TD00000000000000000013", "参照なし", "none@example.com", unknownID
	if err := r.Create(ctx, bad, nil); !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("存在しないチーム: err = %v, want ErrInvalidInput", err)
	}
}

// TestStaffUniqueness は、名前の重なりを許し、メールの重なりを事業所の中でだけ拒むことと、
// 別の事業所に同じメールの職員がいても、結び付けが指定の事業所の職員にだけ書くことを確かめる。
func TestStaffUniqueness(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(*sql.Tx)
	const (
		otherFacility   = "01M3TD00000000000000000020"
		otherDepartment = "01M3TD00000000000000000021"
		otherTeam       = "01M3TD00000000000000000022"
		otherPosition   = "01M3TD00000000000000000023"
	)
	for _, q := range []string{
		"INSERT INTO facilities (id, name) VALUES ('" + otherFacility + "', '別の事業所')",
		"INSERT INTO departments (id, facility_id, name) VALUES ('" + otherDepartment + "', '" + otherFacility + "', '看護')",
		"INSERT INTO teams (id, facility_id, name) VALUES ('" + otherTeam + "', '" + otherFacility + "', 'A')",
		"INSERT INTO positions (id, facility_id, name) VALUES ('" + otherPosition + "', '" + otherFacility + "', 'メンバー')",
	} {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	r := NewStaffRepository(testDB)
	sameFacility := func(id, name, email string) staff.Staff {
		return staff.Staff{ID: id, Username: name, Email: email, FacilityID: seedFacility,
			DepartmentID: seedDepartment, TeamID: seedTeam, PositionID: seedLeader}
	}
	otherAoki := staff.Staff{ID: "01M3TD00000000000000000026", Username: "青木 陽菜", Email: "hina.aoki@example.com",
		FacilityID: otherFacility, DepartmentID: otherDepartment, TeamID: otherTeam, PositionID: otherPosition}
	tests := []struct {
		name    string
		s       staff.Staff
		wantErr error
	}{
		{name: "同じ事業所に同じ名前", s: sameFacility("01M3TD00000000000000000024", "青木 陽菜", "hina.aoki2@example.com")},
		{name: "同じ事業所に同じメール", s: sameFacility("01M3TD00000000000000000025", "別の名前", "hina.aoki@example.com"),
			wantErr: domain.ErrConflict},
		{name: "別の事業所に同じメール", s: otherAoki},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := r.Create(ctx, tt.s, nil); !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
	if err := r.LinkSub(ctx, otherFacility, "hina.aoki@example.com", "sub-other-aoki"); err != nil {
		t.Fatal(err)
	}
	if id, err := r.FindIDBySub(ctx, "sub-other-aoki"); err != nil || id != otherAoki.ID {
		t.Fatalf("id = %q, err = %v, want %q", id, err, otherAoki.ID)
	}
	if got, err := r.Get(ctx, seedAoki); err != nil || got.Sub != nil {
		t.Fatalf("別の事業所の職員に sub を書いた: got %+v, err = %v", got.Summary, err)
	}
}

func TestStaffList(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	tests := []struct {
		name string
		q    staff.ListQuery
		want []string
	}{
		{name: "名前の昇順", q: staff.ListQuery{Sort: domain.Sort{Field: "username"}},
			want: []string{"林 さくら", "森 健太", "青木 陽菜"}},
		{name: "名前の降順", q: staff.ListQuery{Sort: domain.Sort{Field: "username", Desc: true}},
			want: []string{"青木 陽菜", "森 健太", "林 さくら"}},
		{name: "チームで絞る", q: staff.ListQuery{Team: ptr("A"), Sort: domain.Sort{Field: "username"}},
			want: []string{"林 さくら", "青木 陽菜"}},
		{name: "役職で絞る", q: staff.ListQuery{Position: ptr("リーダー"), Sort: domain.Sort{Field: "username"}},
			want: []string{"森 健太"}},
		{name: "部署で絞る", q: staff.ListQuery{Department: ptr("リハビリ"), Sort: domain.Sort{Field: "username"}},
			want: []string{"林 さくら"}},
		{name: "該当なし", q: staff.ListQuery{Username: ptr("いない人"), Sort: domain.Sort{Field: "username"}},
			want: []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, err := r.ListByFacility(ctx, seedFacility, tt.q)
			if err != nil {
				t.Fatal(err)
			}
			got := make([]string, len(rows))
			for i, s := range rows {
				got[i] = s.Username
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestPatientList(t *testing.T) {
	ctx := txContext(t)
	r := NewPatientRepository(testDB)
	morning := patient.Morning
	rows, err := r.ListByFacility(ctx, seedFacility, patient.ListQuery{PreferredTime: &morning, Sort: domain.Sort{Field: "name"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].ID != seedPatient || rows[0].AssignedStaffName != "森 健太" || rows[0].ServiceCode != "訪看I2" {
		t.Errorf("rows = %+v", rows)
	}
	err = r.Create(ctx, patient.Patient{
		ID: "01M3TD00000000000000000020", FacilityID: seedFacility, Name: "見本 三郎",
		PreferredTime: "夜", PreferredGender: patient.Male, ServiceCodeID: seedServiceCode, AssignedStaffID: seedMori,
	})
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("CHECK 制約の違反: err = %v, want ErrInvalidInput", err)
	}
}

func TestVisitCreateInfo(t *testing.T) {
	ctx := txContext(t)
	r := NewVisitRepository(testDB)
	info := visit.Info{
		ID: "01M3TD00000000000000000030", PatientID: seedPatient, AssignedStaffID: seedMori,
		ServiceCodeID: seedServiceCode, CategoryIDs: []string{seedEmergency, seedNight},
	}
	if err := r.CreateInfo(ctx, info); err != nil {
		t.Fatal(err)
	}
	cats, err := r.visitCategories(ctx, []string{info.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(cats[info.ID]) != 2 {
		t.Errorf("categories = %+v", cats)
	}
	found, err := r.ListCategoriesByIDs(ctx, []string{seedNight, unknownID})
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 {
		t.Errorf("found = %+v", found)
	}
}

func TestScheduleGet(t *testing.T) {
	ctx := txContext(t)
	r := NewScheduleRepository(testDB)
	got, err := r.Get(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	if got.TypeName != schedule.Visit || got.StaffName != "森 健太" ||
		got.StartTime != (civil.Time{Hour: 9, Minute: 30}) || got.Date.String() != "2026-10-21" {
		t.Errorf("got %+v", got)
	}
	v := got.Visit
	if v == nil || v.PatientName != "見本 一郎" || v.CompanionName == nil || *v.CompanionName != "林 さくら" ||
		len(v.Categories) != 1 || v.Categories[0].Name != "緊急" {
		t.Errorf("Visit = %+v", v)
	}
	if got.Title != nil || got.Description == nil || got.Cancel != nil {
		t.Errorf("Title = %v, Description = %v, Cancel = %v", got.Title, got.Description, got.Cancel)
	}

	normal, err := r.Get(ctx, seedConference)
	if err != nil {
		t.Fatal(err)
	}
	if normal.Visit != nil || normal.Title == nil || *normal.Title != "カンファレンス" {
		t.Errorf("normal = %+v", normal)
	}
	if _, err := r.Get(ctx, unknownID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestScheduleList(t *testing.T) {
	ctx := txContext(t)
	r := NewScheduleRepository(testDB)
	late := schedule.Schedule{ID: "01M3TD00000000000000000040", Slot: schedule.Slot{
		FacilityID: seedFacility, StaffID: seedHayashi, TypeID: seedNormalType,
		Date: civil.Date{Year: 2026, Month: 10, Day: 20}, StartTime: civil.Time{Hour: 8}, EndTime: civil.Time{Hour: 9},
		Title: ptr("朝の準備"),
	}}
	if err := r.Create(ctx, late); err != nil {
		t.Fatal(err)
	}
	visitName := schedule.Visit
	day := civil.Date{Year: 2026, Month: 10, Day: 20}
	tests := []struct {
		name string
		q    schedule.ListQuery
		want []string
	}{
		{name: "日付と開始の時刻の昇順", q: schedule.ListQuery{Sort: domain.Sort{Field: "date"}},
			want: []string{late.ID, seedConference, seedVisitSchedule}},
		{name: "日付と開始の時刻の降順", q: schedule.ListQuery{Sort: domain.Sort{Field: "date", Desc: true}},
			want: []string{seedVisitSchedule, seedConference, late.ID}},
		{name: "開始の時刻の昇順", q: schedule.ListQuery{Sort: domain.Sort{Field: "start_time"}},
			want: []string{late.ID, seedVisitSchedule, seedConference}},
		{name: "種類で絞る", q: schedule.ListQuery{TypeName: &visitName, Sort: domain.Sort{Field: "date"}},
			want: []string{seedVisitSchedule}},
		{name: "日付で絞る", q: schedule.ListQuery{DateFrom: &day, DateTo: &day, Sort: domain.Sort{Field: "date"}},
			want: []string{late.ID, seedConference}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, err := r.ListByFacility(ctx, seedFacility, tt.q)
			if err != nil {
				t.Fatal(err)
			}
			got := make([]string, len(rows))
			for i, s := range rows {
				got[i] = s.ID
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRecurringScheduleAndExclusion(t *testing.T) {
	ctx := txContext(t)
	r := NewScheduleRepository(testDB)
	rs := schedule.RecurringSchedule{
		ID: "01M3TD00000000000000000050",
		Slot: schedule.Slot{
			FacilityID: seedFacility, StaffID: seedMori, TypeID: seedNormalType,
			Date: civil.Date{Year: 2026, Month: 11, Day: 2}, StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14},
			Title: ptr("月例の会議"),
		},
		Rule: schedule.Rule{ID: "01M3TD00000000000000000051", Frequency: schedule.Monthly,
			WeekOfMonth: ptr(1), DayOfWeek: ptr(1), EndDate: &civil.Date{Year: 2027, Month: 3, Day: 31}},
	}
	if err := r.CreateRecurring(ctx, rs); err != nil {
		t.Fatal(err)
	}
	day := civil.Date{Year: 2026, Month: 12, Day: 7}
	if err := r.AddExclusion(ctx, rs.ID, day); err != nil {
		t.Fatal(err)
	}
	if err := r.AddExclusion(ctx, rs.ID, day); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("同じ日の除外: err = %v, want ErrConflict", err)
	}
	got, err := r.GetRecurring(ctx, rs.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Rule.Frequency != schedule.Monthly || *got.Rule.WeekOfMonth != 1 || got.Rule.DayOfMonth != nil ||
		got.Rule.EndDate.String() != "2027-03-31" {
		t.Errorf("Rule = %+v", got.Rule)
	}
	if len(got.ExclusionDates) != 1 || got.ExclusionDates[0] != day {
		t.Errorf("ExclusionDates = %v", got.ExclusionDates)
	}

	list, err := r.ListRecurringByFacility(ctx, seedFacility, schedule.ListQuery{Sort: domain.Sort{Field: "date"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].ID != seedRecurring || list[1].ID != rs.ID {
		t.Errorf("list = %+v", list)
	}
	if !list[0].IsOverTimeWork || len(list[0].ExclusionDates) != 0 {
		t.Errorf("seed recurring = %+v", list[0])
	}
}

func TestScheduleCancel(t *testing.T) {
	ctx := txContext(t)
	r := NewScheduleRepository(testDB)
	c := schedule.Cancel{ID: "01M3TD00000000000000000060", ScheduleID: seedConference, Reason: "体調不良"}
	if err := r.CreateCancel(ctx, c); err != nil {
		t.Fatal(err)
	}
	c.ID = "01M3TD00000000000000000061"
	if err := r.CreateCancel(ctx, c); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("2 度目のキャンセル: err = %v, want ErrConflict", err)
	}
	got, err := r.Get(ctx, seedConference)
	if err != nil {
		t.Fatal(err)
	}
	if got.Cancel == nil || got.Cancel.Reason != "体調不良" {
		t.Errorf("Cancel = %+v", got.Cancel)
	}
}

func TestScheduleUpdateAndDeleteUnusedVisitInfo(t *testing.T) {
	ctx := txContext(t)
	r := NewScheduleRepository(testDB)
	visits := NewVisitRepository(testDB)
	cur, err := r.Get(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	oldInfo := *cur.VisitInfoID
	countInfo := func() int {
		t.Helper()
		var n int
		tx := ctx.Value(txKey{}).(*sql.Tx)
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM visit_infos WHERE id = ?", oldInfo).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if err := visits.DeleteInfoIfUnused(ctx, oldInfo); err != nil {
		t.Fatal(err)
	}
	if countInfo() != 1 {
		t.Fatal("予定が指している訪問の情報を消した")
	}

	updated := schedule.Schedule{ID: seedVisitSchedule, Slot: schedule.Slot{
		StaffID: seedAoki, TypeID: seedNormalType, Date: civil.Date{Year: 2026, Month: 10, Day: 22},
		StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14}, Title: ptr("記録の整理"),
	}}
	if err := r.Update(ctx, updated); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	if got.TypeName != schedule.Normal || got.StaffID != seedAoki || got.Date.String() != "2026-10-22" ||
		got.Title == nil || *got.Title != "記録の整理" || got.VisitInfoID != nil || got.FacilityID != seedFacility {
		t.Errorf("got %+v", got)
	}

	if err := visits.DeleteInfoIfUnused(ctx, oldInfo); err != nil {
		t.Fatal(err)
	}
	if countInfo() != 0 {
		t.Error("どの予定も指さない訪問の情報が残った")
	}
}

func TestScheduleUpdateKeepsRecurringAndSharedVisitInfo(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(*sql.Tx)
	r := NewScheduleRepository(testDB)
	visits := NewVisitRepository(testDB)
	cur, err := r.Get(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"UPDATE recurring_schedules SET visit_info_id = '" + *cur.VisitInfoID + "' WHERE id = '" + seedRecurring + "'",
		"UPDATE schedules SET recurring_schedule_id = '" + seedRecurring + "' WHERE id = '" + seedVisitSchedule + "'",
	} {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	updated := schedule.Schedule{ID: seedVisitSchedule, Slot: schedule.Slot{
		StaffID: seedMori, TypeID: seedNormalType, Date: civil.Date{Year: 2026, Month: 10, Day: 22},
		StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14}, Title: ptr("記録の整理"),
	}}
	if err := r.Update(ctx, updated); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	if got.RecurringScheduleID == nil || *got.RecurringScheduleID != seedRecurring {
		t.Errorf("RecurringScheduleID = %v", got.RecurringScheduleID)
	}
	if err := visits.DeleteInfoIfUnused(ctx, *cur.VisitInfoID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM visit_infos WHERE id = ?", *cur.VisitInfoID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Error("繰り返しの予定が指している訪問の情報を消した")
	}
}

func TestScheduleLockBlocksCancel(t *testing.T) {
	if testDB == nil {
		t.Skip("MySQL を使うテストは -short では動かさない")
	}
	bg := context.Background()
	r := NewScheduleRepository(testDB)
	if err := r.Lock(bg, unknownID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("無い予定のロック: err = %v, want ErrNotFound", err)
	}
	locker, err := testDB.BeginTx(bg, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = locker.Rollback() }()
	if err := r.Lock(context.WithValue(bg, txKey{}, locker), seedConference); err != nil {
		t.Fatal(err)
	}
	canceler, err := testDB.BeginTx(bg, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = canceler.Rollback() }()
	done := make(chan error, 1)
	go func() {
		done <- r.CreateCancel(context.WithValue(bg, txKey{}, canceler),
			schedule.Cancel{ID: "01M3TD00000000000000000070", ScheduleID: seedConference, Reason: "体調不良"})
	}()
	select {
	case err := <-done:
		t.Fatalf("ロックの間にキャンセルが終わった: err = %v", err)
	case <-time.After(300 * time.Millisecond):
	}
	if err := locker.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestTransactorRollsBack(t *testing.T) {
	if testDB == nil {
		t.Skip("MySQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	teams := NewTeamRepository(testDB)
	team := organization.Team{ID: "01M3TD00000000000000000070", FacilityID: seedFacility, Name: "ロールバック"}
	wantErr := errors.New("中断")
	err := NewTransactor(testDB).WithinTx(ctx, func(ctx context.Context) error {
		if err := teams.Create(ctx, team); err != nil {
			return err
		}
		if _, err := teams.Get(ctx, team.ID); err != nil {
			t.Errorf("トランザクションの中で読めない: %v", err)
		}
		return wantErr
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("err = %v", err)
	}
	if _, err := teams.Get(ctx, team.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("ロールバックした行が残る: err = %v", err)
	}
}
