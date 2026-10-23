package postgres

import (
	"context"
	"errors"
	"maps"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
)

// seed.sql の ID。
const (
	seedFacility      = "01M3TC5H00QV17BC0J9V3393ZP"
	seedDepartment    = "01M3TC5HZ8A18D2TP3PTKDXJMN"
	seedTeam          = "01M3TC5KXRSEVXQZ2MTJK9FS45"
	seedLeader        = "01M3TC5PVG7W2H1H20W0T1ZVEJ"
	seedMember        = "01M3TC5QTRHSXHE7C68HPN6MBH"
	seedTeamB         = "01M3TC5MX04QJ19X6XR1ZCBZRJ"
	seedViewPolicy    = "01M5E1S42TTS7QZK05YGS0GYRD"
	seedEditPolicy    = "01M5E1S42TTS7QZK05YGS0GYRE"
	seedSelfEdit      = "01M5E1S42TTS7QZK05YGS0GYR8"
	seedTeamRead      = "01M5E1S42TTS7QZK05YGS0GYRB"
	seedTeamEdit      = "01M5E1S42TTS7QZK05YGS0GYRC"
	seedUserRead      = "01M5E1S42TTS7QZK05YGS0GYR9"
	seedStaffManage   = "01M5E5GP6Q8BQYNWN66QHJF60J"
	seedAoki          = "01M3TC5TRG5200KYWTZW6ER3WN"
	seedMori          = "01M3TC5VQR3MKFF9AA4BVKF44Z"
	seedHayashi       = "01M3TC5WQ08KWBZX85WAZ1C4N7"
	seedMoriSub       = "01M5J20JC1DAXJCPMP36TYGJ0A"
	seedHayashiSub    = "01M5J20JC21Z5PZ92E3CD6HN03"
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
	if _, err := r.Get(ctx, unknownID); !errors.Is(err, apperr.ErrNotFound) {
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
	if _, err := r.GetByOrgID(ctx, "org-unknown"); !errors.Is(err, apperr.ErrNotFound) {
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
	if err := r.Create(ctx, dup); !errors.Is(err, apperr.ErrConflict) {
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
	if got.PositionName != "リーダー" || got.TeamName != "B" || got.Sub == nil || *got.Sub != seedMoriSub {
		t.Errorf("got %+v", got.Summary)
	}
	byID := make(map[string]staff.PolicyGrant, len(got.Policies))
	for _, p := range got.Policies {
		byID[p.PolicyID] = p
	}
	if len(got.Policies) != 3 || byID[seedSelfEdit].PolicyCode != organization.ScheduleSelfEdit {
		t.Errorf("Policies = %+v", got.Policies)
	}
	for _, id := range []string{seedTeamRead, seedTeamEdit} {
		if p := byID[id]; !slices.Equal(p.TargetTeamIDs, []string{seedTeamB}) || len(p.TargetUserIDs) != 0 {
			t.Errorf("チームの権限 %s = %+v, want チーム B", id, p)
		}
	}
	hayashi, err := r.Get(ctx, seedHayashi)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range hayashi.Policies {
		if p.PolicyID == seedUserRead && !slices.Equal(p.TargetUserIDs, []string{seedMori}) {
			t.Errorf("職員の権限 = %+v, want 森", p)
		}
	}
	if _, err := r.Get(ctx, unknownID); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestStaffRef(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRefRepository(testDB)
	got, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	if got != (staff.Ref{ID: seedMori, FacilityID: seedFacility, TeamID: seedTeamB}) {
		t.Errorf("got %+v", got)
	}
	if _, err := r.Get(ctx, unknownID); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	refs, err := r.ListByFacility(ctx, seedFacility)
	if err != nil {
		t.Fatal(err)
	}
	if slices.ContainsFunc(refs, func(ref staff.Ref) bool { return ref.FacilityID != seedFacility }) {
		t.Errorf("refs = %+v, want 事業所の職員だけ", refs)
	}
	if !slices.ContainsFunc(refs, func(ref staff.Ref) bool { return ref == got }) ||
		!slices.IsSortedFunc(refs, func(a, b staff.Ref) int { return strings.Compare(a.ID, b.ID) }) {
		t.Errorf("refs = %+v, want 森を含む ID の順", refs)
	}
}

// unlinkSub は、シードで結び付け済みの職員 id の sub を、トランザクションの中で初回のログインの前の状態に戻す。
func unlinkSub(t *testing.T, ctx context.Context, id string) {
	t.Helper()
	if _, err := ctx.Value(txKey{}).(pgx.Tx).Exec(ctx, "UPDATE users SET sub = NULL WHERE id = $1", id); err != nil {
		t.Fatal(err)
	}
}

func TestStaffLinkSub(t *testing.T) {
	ctx := txContext(t)
	unlinkSub(t, ctx, seedAoki)
	r := NewStaffRepository(testDB)
	if err := r.LinkSub(ctx, unknownID, "hina.aoki@example.com", "sub-other-facility"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.FindIDBySub(ctx, "sub-other-facility"); !errors.Is(err, apperr.ErrNotFound) {
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
	if _, err := r.FindIDBySub(ctx, "sub-2"); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("結び付け済みの sub を書き換えた: err = %v", err)
	}
}

// TestStaffLinkSubConcurrent は、トランザクションの外で同時に結び付け、書かれた sub が 1 つだけであることを確かめる。
func TestStaffLinkSubConcurrent(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	if _, err := testDB.Exec(ctx, "UPDATE users SET sub = NULL WHERE id = $1", seedHayashi); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := testDB.Exec(ctx, "UPDATE users SET sub = $2 WHERE id = $1", seedHayashi, seedHayashiSub); err != nil {
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
	grants := []staff.Grant{
		{ID: "01M3TD00000000000000000011", PolicyID: seedViewPolicy},
		{ID: "01M3TD00000000000000000013", PolicyID: seedTeamRead,
			Targets: []staff.Target{{ID: "01M3TD00000000000000000014", TeamID: seedTeam}}},
		{ID: "01M3TD00000000000000000015", PolicyID: seedUserRead,
			Targets: []staff.Target{{ID: "01M3TD00000000000000000016", UserID: seedMori}}},
	}
	if err := r.Create(ctx, s, grants); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.PhoneNumber == nil || *got.PhoneNumber != "+09000000000" || len(got.Policies) != 3 {
		t.Errorf("got %+v", got)
	}
	for _, p := range got.Policies {
		switch p.PolicyID {
		case seedTeamRead:
			if !slices.Equal(p.TargetTeamIDs, []string{seedTeam}) {
				t.Errorf("チームの対象 = %+v", p)
			}
		case seedUserRead:
			if !slices.Equal(p.TargetUserIDs, []string{seedMori}) {
				t.Errorf("職員の対象 = %+v", p)
			}
		}
	}
	dup := s
	dup.ID = "01M3TD00000000000000000012"
	dup.Username = "別の名前"
	if err := r.Create(ctx, dup, nil); !errors.Is(err, apperr.ErrConflict) {
		t.Fatalf("同じメール: err = %v, want ErrConflict", err)
	}
	bad := s
	bad.ID, bad.Username, bad.Email, bad.TeamID = "01M3TD00000000000000000013", "参照なし", "none@example.com", unknownID
	if err := r.Create(ctx, bad, nil); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("存在しないチーム: err = %v, want ErrInvalidInput", err)
	}
}

// TestStaffUniqueness は、名前の重なりを許し、メールの重なりを事業所の中でだけ拒むことと、
// 別の事業所に同じメールの職員がいても、結び付けが指定の事業所の職員にだけ書くことを確かめる。
func TestStaffUniqueness(t *testing.T) {
	ctx := txContext(t)
	unlinkSub(t, ctx, seedAoki)
	tx := ctx.Value(txKey{}).(pgx.Tx)
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
		if _, err := tx.Exec(ctx, q); err != nil {
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
			wantErr: apperr.ErrConflict},
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
		{name: "名前の昇順", q: staff.ListQuery{Sort: kernel.Sort{Field: "username"}},
			want: []string{"佐藤 美咲", "林 さくら", "森 健太", "青木 陽菜"}},
		{name: "名前の降順", q: staff.ListQuery{Sort: kernel.Sort{Field: "username", Desc: true}},
			want: []string{"青木 陽菜", "森 健太", "林 さくら", "佐藤 美咲"}},
		{name: "チームで絞る", q: staff.ListQuery{Team: ptr("A"), Sort: kernel.Sort{Field: "username"}},
			want: []string{"林 さくら", "青木 陽菜"}},
		{name: "役職で絞る", q: staff.ListQuery{Position: ptr("リーダー"), Sort: kernel.Sort{Field: "username"}},
			want: []string{"森 健太"}},
		{name: "部署で絞る", q: staff.ListQuery{Department: ptr("リハビリ"), Sort: kernel.Sort{Field: "username"}},
			want: []string{"林 さくら"}},
		{name: "該当なし", q: staff.ListQuery{Username: ptr("いない人"), Sort: kernel.Sort{Field: "username"}},
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
	rows, err := r.ListByFacility(ctx, seedFacility, patient.ListQuery{PreferredTime: &morning, Sort: kernel.Sort{Field: "name"}})
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
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("CHECK 制約の違反: err = %v, want ErrInvalidInput", err)
	}
}

func TestVisitInfoCreate(t *testing.T) {
	ctx := txContext(t)
	r := NewVisitInfoRepository(testDB)
	info := visit.Info{
		ID: "01M3TD00000000000000000030", FacilityID: seedFacility, PatientID: seedPatient, AssignedStaffID: seedMori,
		ServiceCodeID: seedServiceCode, CategoryIDs: []string{seedEmergency, seedNight},
	}
	if err := r.Create(ctx, info); err != nil {
		t.Fatal(err)
	}
	cats, err := r.visitCategories(ctx, []string{info.ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(cats[info.ID]) != 2 {
		t.Errorf("categories = %+v", cats)
	}
	found, err := NewVisitMasterRepository(testDB).ListCategoriesByIDs(ctx, []string{seedNight, unknownID})
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
	if _, err := r.Get(ctx, unknownID); !errors.Is(err, apperr.ErrNotFound) {
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
		{name: "日付と開始の時刻の昇順", q: schedule.ListQuery{Sort: kernel.Sort{Field: "date"}},
			want: []string{late.ID, seedConference, seedVisitSchedule}},
		{name: "日付と開始の時刻の降順", q: schedule.ListQuery{Sort: kernel.Sort{Field: "date", Desc: true}},
			want: []string{seedVisitSchedule, seedConference, late.ID}},
		{name: "開始の時刻の昇順", q: schedule.ListQuery{Sort: kernel.Sort{Field: "start_time"}},
			want: []string{late.ID, seedVisitSchedule, seedConference}},
		{name: "種類で絞る", q: schedule.ListQuery{TypeName: &visitName, Sort: kernel.Sort{Field: "date"}},
			want: []string{seedVisitSchedule}},
		{name: "日付で絞る", q: schedule.ListQuery{DateFrom: &day, DateTo: &day, Sort: kernel.Sort{Field: "date"}},
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
	r := NewRecurringScheduleRepository(testDB)
	rs := schedule.RecurringSchedule{
		ID: "01M3TD00000000000000000050",
		Slot: schedule.Slot{
			FacilityID: seedFacility, StaffID: seedMori, TypeID: seedNormalType,
			Date: civil.Date{Year: 2026, Month: 11, Day: 2}, StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14},
			Title: ptr("月例の会議"),
		},
		Rule: schedule.Rule{Frequency: schedule.Monthly,
			WeekOfMonth: ptr(1), DayOfWeek: ptr(1), EndDate: &civil.Date{Year: 2027, Month: 3, Day: 31}},
	}
	if err := r.Create(ctx, rs); err != nil {
		t.Fatal(err)
	}
	day := civil.Date{Year: 2026, Month: 12, Day: 7}
	if err := r.AddExclusion(ctx, rs.ID, day); err != nil {
		t.Fatal(err)
	}
	if err := r.AddExclusion(ctx, rs.ID, day); !errors.Is(err, apperr.ErrConflict) {
		t.Fatalf("同じ日の除外: err = %v, want ErrConflict", err)
	}
	got, err := r.Get(ctx, rs.ID)
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

	list, err := r.ListByFacility(ctx, seedFacility, schedule.ListQuery{Sort: kernel.Sort{Field: "date"}})
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
	if err := r.CreateCancel(ctx, c); !errors.Is(err, apperr.ErrConflict) {
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
	visits := NewVisitInfoRepository(testDB)
	cur, err := r.Get(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	oldInfo := *cur.VisitInfoID
	countInfo := func() int {
		t.Helper()
		var n int
		tx := ctx.Value(txKey{}).(pgx.Tx)
		if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM visit_infos WHERE id = $1", oldInfo).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if err := visits.DeleteIfUnused(ctx, oldInfo); err != nil {
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

	if err := visits.DeleteIfUnused(ctx, oldInfo); err != nil {
		t.Fatal(err)
	}
	if countInfo() != 0 {
		t.Error("どの予定も指さない訪問の情報が残った")
	}
}

func TestScheduleUpdateKeepsRecurringAndSharedVisitInfo(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(pgx.Tx)
	r := NewScheduleRepository(testDB)
	visits := NewVisitInfoRepository(testDB)
	cur, err := r.Get(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"UPDATE recurring_schedules SET visit_info_id = '" + *cur.VisitInfoID + "' WHERE id = '" + seedRecurring + "'",
		"UPDATE schedules SET recurring_schedule_id = '" + seedRecurring + "', original_date = '2026-10-19' WHERE id = '" + seedVisitSchedule + "'",
	} {
		if _, err := tx.Exec(ctx, q); err != nil {
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
	if got.RecurringScheduleID == nil || *got.RecurringScheduleID != seedRecurring ||
		got.OriginalDate == nil || got.OriginalDate.String() != "2026-10-19" {
		t.Errorf("RecurringScheduleID = %v, OriginalDate = %v", got.RecurringScheduleID, got.OriginalDate)
	}
	if err := visits.DeleteIfUnused(ctx, *cur.VisitInfoID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM visit_infos WHERE id = $1", *cur.VisitInfoID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Error("繰り返しの予定が指している訪問の情報を消した")
	}
}

func TestScheduleGetForUpdateBlocksCancel(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	bg := context.Background()
	r := NewScheduleRepository(testDB)
	if _, err := r.GetForUpdate(bg, unknownID); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("無い予定のロック: err = %v, want ErrNotFound", err)
	}
	locker, err := testDB.Begin(bg)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = locker.Rollback(bg) }()
	locked, err := r.GetForUpdate(context.WithValue(bg, txKey{}, locker), seedConference)
	if err != nil {
		t.Fatal(err)
	}
	if locked.ID != seedConference || locked.StaffID == "" {
		t.Fatalf("GetForUpdate = %+v, want 会議の予定", locked.Schedule)
	}
	canceler, err := testDB.Begin(bg)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = canceler.Rollback(bg) }()
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
	if err := locker.Rollback(bg); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestTransactorRollsBack(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
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
	if _, err := teams.Get(ctx, team.ID); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("ロールバックしたレコードが残る: err = %v", err)
	}
}

func TestPolicyList(t *testing.T) {
	ctx := txContext(t)
	got, err := NewPolicyRepository(testDB).List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	needsTarget := map[organization.PolicyCode]bool{}
	for _, p := range got {
		needsTarget[p.Code] = p.NeedsTarget
	}
	want := map[organization.PolicyCode]bool{
		organization.ScheduleSelfEdit: false,
		organization.ScheduleUserRead: true,
		organization.ScheduleUserEdit: true,
		organization.ScheduleTeamRead: true,
		organization.ScheduleTeamEdit: true,
		organization.ScheduleAllRead:  false,
		organization.ScheduleAllEdit:  false,
		organization.StaffManage:      false,
	}
	if len(got) != len(want) || !maps.Equal(needsTarget, want) {
		t.Errorf("権限 = %+v", got)
	}
}

// TestStaffCreateRejectsTarget は、対象の職員とチームの両方か、どちらも持たない対象を DB が拒むことを確かめる。
func TestStaffCreateRejectsTarget(t *testing.T) {
	for name, target := range map[string]staff.Target{
		"両方":     {ID: "01M3TD00000000000000000021", UserID: seedMori, TeamID: seedTeam},
		"どちらもない": {ID: "01M3TD00000000000000000021"},
	} {
		t.Run(name, func(t *testing.T) {
			ctx := txContext(t)
			s := staff.Staff{
				ID: "01M3TD00000000000000000020", Username: "新人 二葉", Email: "futaba@example.com",
				FacilityID: seedFacility, DepartmentID: seedDepartment, TeamID: seedTeam, PositionID: seedLeader,
			}
			grants := []staff.Grant{{ID: "01M3TD00000000000000000022", PolicyID: seedUserRead, Targets: []staff.Target{target}}}
			if err := NewStaffRepository(testDB).Create(ctx, s, grants); err == nil {
				t.Fatal("err = nil, want 制約の違反")
			}
		})
	}
}

// TestStaffChangePosition は、役職を変えると、前の権限と対象が消え、渡した権限だけになることを確かめる。
func TestStaffChangePosition(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	grants := []staff.Grant{{ID: "01M3TD00000000000000000030", PolicyID: seedSelfEdit}}
	if err := r.ChangePosition(ctx, seedMori, seedMember, grants); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	if got.PositionID != seedMember || got.PositionName != "メンバー" {
		t.Errorf("役職 = %s %s", got.PositionID, got.PositionName)
	}
	if len(got.Policies) != 1 || got.Policies[0].PolicyID != seedSelfEdit || len(got.Policies[0].TargetTeamIDs) != 0 {
		t.Errorf("Policies = %+v, want 自分の予定の編集だけ", got.Policies)
	}
	var targets int
	tx := ctx.Value(txKey{}).(pgx.Tx)
	if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM user_policy_targets upt JOIN user_policies up ON up.id = upt.user_policy_id WHERE up.user_id = $1", seedMori).Scan(&targets); err != nil {
		t.Fatal(err)
	}
	if targets != 0 {
		t.Errorf("森の対象のレコード = %d, want 0", targets)
	}
}

// TestStaffAddAndRemoveGrant は、権限と対象を足し、同じ権限の 2 つ目を拒み、外すと対象も消えることを確かめる。
func TestStaffAddAndRemoveGrant(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	g := staff.Grant{ID: "01M3TD00000000000000000040", PolicyID: seedUserRead,
		Targets: []staff.Target{{ID: "01M3TD00000000000000000041", UserID: seedHayashi}}}
	if err := r.AddGrant(ctx, seedMori, g); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(got.Policies, func(p staff.PolicyGrant) bool {
		return p.UserPolicyID == g.ID && slices.Equal(p.TargetUserIDs, []string{seedHayashi})
	}) {
		t.Errorf("Policies = %+v", got.Policies)
	}
	dup := staff.Grant{ID: "01M3TD00000000000000000042", PolicyID: seedUserRead}
	if err := r.AddGrant(ctx, seedMori, dup); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("同じ権限: err = %v, want ErrConflict", err)
	}
	if err := r.RemoveGrant(ctx, seedHayashi, g.ID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("別の職員の権限を外す: err = %v, want ErrNotFound", err)
	}
	if err := r.RemoveGrant(ctx, seedMori, g.ID); err != nil {
		t.Fatal(err)
	}
	var targets int
	tx := ctx.Value(txKey{}).(pgx.Tx)
	if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM user_policy_targets WHERE user_policy_id = $1", g.ID).Scan(&targets); err != nil {
		t.Fatal(err)
	}
	if targets != 0 {
		t.Errorf("外した権限の対象のレコード = %d, want 0", targets)
	}
}

func TestSeedStaffManage(t *testing.T) {
	ctx := txContext(t)
	got, err := NewStaffRepository(testDB).Get(ctx, seedAoki)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(got.Policies, func(p staff.PolicyGrant) bool { return p.PolicyID == seedStaffManage }) {
		t.Errorf("青木（管理者）の Policies = %+v, want 職員の管理を含む", got.Policies)
	}
}

// TestGrantAllowsReadingTarget は、職員の権限を足すと、DB から読み直した職員の判定で対象の職員の予定を見られることを確かめる。
func TestGrantAllowsReadingTarget(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	hayashi, err := r.Get(ctx, seedHayashi)
	if err != nil {
		t.Fatal(err)
	}
	before, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	if schedule.CanRead(principal.Principal{Staff: before}, hayashi.ID, hayashi.TeamID) {
		t.Fatal("森は、権限を足す前から林の予定を見られた")
	}
	g := staff.Grant{ID: "01M3TD00000000000000000050", PolicyID: seedUserRead,
		Targets: []staff.Target{{ID: "01M3TD00000000000000000051", UserID: seedHayashi}}}
	if err := r.AddGrant(ctx, seedMori, g); err != nil {
		t.Fatal(err)
	}
	after, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	p := principal.Principal{Staff: after}
	if !schedule.CanRead(p, hayashi.ID, hayashi.TeamID) || schedule.CanEdit(p, hayashi.ID, hayashi.TeamID) {
		t.Errorf("森の権限 = %+v, want 林の予定の閲覧だけ", after.Policies)
	}
}

// TestNamesAreComparedExactly は、名前の一意の制約と絞り込みが、清音と濁音、全角と半角、大文字と小文字を別の名前とみなすことを確かめる。
func TestNamesAreComparedExactly(t *testing.T) {
	ctx := txContext(t)
	r := NewTeamRepository(testDB)
	for i, name := range []string{"ハ", "バ", "ﾊ", "a", "Ａ"} {
		team := organization.Team{ID: "01M3TD000000000000000000A" + string(rune('0'+i)), FacilityID: seedFacility, Name: name}
		if err := r.Create(ctx, team); err != nil {
			t.Fatalf("チーム %q: err = %v", name, err)
		}
	}
	dup := organization.Team{ID: "01M3TD000000000000000000B0", FacilityID: seedFacility, Name: "バ"}
	if err := r.Create(ctx, dup); !errors.Is(err, apperr.ErrConflict) {
		t.Fatalf("同じ名前のチーム: err = %v, want ErrConflict", err)
	}
	rows, err := NewStaffRepository(testDB).ListByFacility(ctx, seedFacility,
		staff.ListQuery{Team: ptr("a"), Sort: kernel.Sort{Field: "username"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Errorf("チーム a で絞って、チーム A の職員 %d 人を返した", len(rows))
	}
}

func TestStaffCreateRejectsUppercaseEmail(t *testing.T) {
	ctx := txContext(t)
	s := staff.Staff{ID: "01M3TD000000000000000000C0", Username: "新人 三春", Email: "Miharu@example.com",
		FacilityID: seedFacility, DepartmentID: seedDepartment, TeamID: seedTeam, PositionID: seedMember}
	if err := NewStaffRepository(testDB).Create(ctx, s, nil); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("小文字にそろえていないメール: err = %v, want ErrInvalidInput", err)
	}
}

// TestScheduleRejectsOtherFacilityStaff は、複合の外部キーが、別の事業所の職員を指す予定を拒むことを確かめる。
func TestScheduleRejectsOtherFacilityStaff(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(pgx.Tx)
	const (
		otherFacility   = "01M3TD000000000000000000D0"
		otherDepartment = "01M3TD000000000000000000D1"
		otherTeam       = "01M3TD000000000000000000D2"
		otherPosition   = "01M3TD000000000000000000D3"
		otherStaff      = "01M3TD000000000000000000D4"
	)
	for _, q := range []string{
		"INSERT INTO facilities (id, name) VALUES ('" + otherFacility + "', '別の事業所')",
		"INSERT INTO departments (id, facility_id, name) VALUES ('" + otherDepartment + "', '" + otherFacility + "', '看護')",
		"INSERT INTO teams (id, facility_id, name) VALUES ('" + otherTeam + "', '" + otherFacility + "', 'A')",
		"INSERT INTO positions (id, facility_id, name) VALUES ('" + otherPosition + "', '" + otherFacility + "', 'メンバー')",
		"INSERT INTO users (id, username, email, facility_id, department_id, team_id, position_id) VALUES ('" + otherStaff +
			"', '別の職員', 'other@example.com', '" + otherFacility + "', '" + otherDepartment + "', '" + otherTeam + "', '" + otherPosition + "')",
	} {
		if _, err := tx.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	s := schedule.Schedule{ID: "01M3TD000000000000000000D5", Slot: schedule.Slot{
		FacilityID: seedFacility, StaffID: otherStaff, TypeID: seedNormalType,
		Date: civil.Date{Year: 2026, Month: 10, Day: 23}, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10},
		Title: ptr("会議"),
	}}
	if err := NewScheduleRepository(testDB).Create(ctx, s); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("別の事業所の職員の予定: err = %v, want ErrInvalidInput", err)
	}
}

// TestScheduleColumnsFromDB は、時間外の勤務を開始の時刻から DB が決めることと、置き換えた回の組と訪問の情報が予定ごとに一意であることを確かめる。
func TestScheduleColumnsFromDB(t *testing.T) {
	ctx := txContext(t)
	r := NewScheduleRepository(testDB)
	slot := schedule.Slot{
		FacilityID: seedFacility, StaffID: seedAoki, TypeID: seedNormalType,
		Date: civil.Date{Year: 2026, Month: 10, Day: 12}, StartTime: civil.Time{Hour: 17}, EndTime: civil.Time{Hour: 18},
		Title: ptr("申し送り"),
	}
	original := civil.Date{Year: 2026, Month: 10, Day: 12}
	replaced := schedule.Schedule{ID: "01M3TD000000000000000000E0", Slot: slot,
		RecurringScheduleID: ptr(seedRecurring), OriginalDate: &original}
	if err := r.Create(ctx, replaced); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, replaced.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.IsOverTimeWork || got.OriginalDate == nil || *got.OriginalDate != original {
		t.Errorf("IsOverTimeWork = %v, OriginalDate = %v", got.IsOverTimeWork, got.OriginalDate)
	}
	tests := []struct {
		name string
		s    schedule.Schedule
		want error
	}{
		{name: "同じ回を 2 度置き換える", want: apperr.ErrConflict,
			s: schedule.Schedule{ID: "01M3TD000000000000000000E1", Slot: slot, RecurringScheduleID: ptr(seedRecurring), OriginalDate: &original}},
		{name: "元の回の日付がない", want: apperr.ErrInvalidInput,
			s: schedule.Schedule{ID: "01M3TD000000000000000000E2", Slot: slot, RecurringScheduleID: ptr(seedRecurring)}},
		{name: "ほかの予定の訪問の情報", want: apperr.ErrConflict,
			s: schedule.Schedule{ID: "01M3TD000000000000000000E3", Slot: schedule.Slot{
				FacilityID: seedFacility, StaffID: seedMori, TypeID: seedVisitType,
				Date: original, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10},
				VisitInfoID: ptr("01M3TC6ACG2Z0J6Y2DFBS8QRR9"),
			}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := r.Create(ctx, tt.s); !errors.Is(err, tt.want) {
				t.Fatalf("err = %v, want %v", err, tt.want)
			}
		})
	}
}

// TestExternalCalendarsOneActivePerStaff は、職員ごとに 1 つの外部のカレンダーの制約が、外していないレコードだけに当たることを確かめる。
func TestExternalCalendarsOneActivePerStaff(t *testing.T) {
	ctx := txContext(t)
	tx := ctx.Value(txKey{}).(pgx.Tx)
	insert := func(id, calendarID string) error {
		_, err := tx.Exec(ctx, `INSERT INTO external_calendars (id, facility_id, staff_id, provider, external_calendar_id)
			VALUES ($1, $2, $3, 'google', $4)`, id, seedFacility, seedMori, calendarID)
		return translate("insert external calendar", err)
	}
	if err := insert("01M3TD000000000000000000F0", "first@example.com"); err != nil {
		t.Fatal(err)
	}
	if err := insert("01M3TD000000000000000000F1", "second@example.com"); !errors.Is(err, apperr.ErrConflict) {
		t.Fatalf("外していないカレンダーがある職員の 2 つ目: err = %v, want ErrConflict", err)
	}
	if _, err := tx.Exec(ctx, "UPDATE external_calendars SET disabled_at = now() WHERE id = '01M3TD000000000000000000F0'"); err != nil {
		t.Fatal(err)
	}
	if err := insert("01M3TD000000000000000000F1", "second@example.com"); err != nil {
		t.Fatalf("外した後の 2 つ目: err = %v", err)
	}
}

func TestTranslateRejectsNUL(t *testing.T) {
	ctx := txContext(t)
	team := organization.Team{ID: "01M3TD000000000000000000G0", FacilityID: seedFacility, Name: "a\x00b"}
	if err := NewTeamRepository(testDB).Create(ctx, team); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("NUL を含む名前: err = %v, want ErrInvalidInput", err)
	}
}

func TestTimestampsAreUTC(t *testing.T) {
	ctx := txContext(t)
	f, err := NewFacilityRepository(testDB).Get(ctx, seedFacility)
	if err != nil {
		t.Fatal(err)
	}
	if f.CreatedAt.Location() != time.UTC {
		t.Errorf("CreatedAt の場所 = %v, want UTC", f.CreatedAt.Location())
	}
}

func TestStaffAddGrantToUnknownStaff(t *testing.T) {
	ctx := txContext(t)
	g := staff.Grant{ID: "01M3TD000000000000000000G1", PolicyID: seedSelfEdit}
	if err := NewStaffRepository(testDB).AddGrant(ctx, unknownID, g); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("いない職員への権限: err = %v, want ErrInvalidInput", err)
	}
}
