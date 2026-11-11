package postgres

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// seed.sql の ID。
const (
	seedFacility       = "01M3TC5H00QV17BC0J9V3393ZP"
	seedGoogleFacility = "01MA0GP0000000000000000FAC"
	seedOkada          = "01MA0GP0000000000000000STF"
	seedOkadaCalendar  = "01MA0GP0000000000000000GCA"
	// seedIshidaCalendar は、4 つ目の事業所（google_primary）の石田のカレンダーである。予定の管理の移行の E2E が使う。
	seedIshidaCalendar = "01MA0CT0000000000000000GCA"
	seedDepartment     = "01M3TC5HZ8A18D2TP3PTKDXJMN"
	seedTeam           = "01M3TC5KXRSEVXQZ2MTJK9FS45"
	seedLeader         = "01M3TC5PVG7W2H1H20W0T1ZVEJ"
	seedMember         = "01M3TC5QTRHSXHE7C68HPN6MBH"
	seedTeamB          = "01M3TC5MX04QJ19X6XR1ZCBZRJ"
	seedViewPolicy     = "01M5E1S42TTS7QZK05YGS0GYRD"
	seedEditPolicy     = "01M5E1S42TTS7QZK05YGS0GYRE"
	seedSelfEdit       = "01M5E1S42TTS7QZK05YGS0GYR8"
	seedTeamRead       = "01M5E1S42TTS7QZK05YGS0GYRB"
	seedTeamEdit       = "01M5E1S42TTS7QZK05YGS0GYRC"
	seedUserRead       = "01M5E1S42TTS7QZK05YGS0GYR9"
	seedStaffManage    = "01M5E5GP6Q8BQYNWN66QHJF60J"
	seedAoki           = "01M3TC5TRG5200KYWTZW6ER3WN"
	seedMori           = "01M3TC5VQR3MKFF9AA4BVKF44Z"
	seedHayashi        = "01M3TC5WQ08KWBZX85WAZ1C4N7"
	seedMoriSub        = "01M5J20JC1DAXJCPMP36TYGJ0A"
	seedHayashiSub     = "01M5J20JC21Z5PZ92E3CD6HN03"
	seedPatient        = "01M3TC66FGZVK39Y7GRVZSGWS1"
	seedServiceCode    = "01M3TC60M0XC173N54CJQRKFVR"
	seedEmergency      = "01M3TC64H0JJHBDMJQPGBX9FM7"
	seedNight          = "01M3TC63HR6H7CP0CVRZGED7BB"
	seedNormalType     = "01M3TC68E05E1N46YCCBT6ZQB2"
	seedVisitType      = "01M3TC69D8KB2938F3GS7WBVT5"
	seedConference     = "01M3TC6BBRBQM0QK0S43P56AFH"
	seedVisitSchedule  = "01M3TC6CB064BZXJVJBCC4ZSY5"
	seedRecurring      = "01M3TC6E9G4N8Q2R5T7V9W1X3Y"
	unknownID          = "01M3TCZZZZZZZZZZZZZZZZZZZZ"
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

// TestFacilityGetForShare は、共有のロックを取って読んだ事業所が、シードの予定の管理先を持つことを確認する。
func TestFacilityGetForShare(t *testing.T) {
	ctx := txContext(t)
	r := NewFacilityRepository(testDB)
	for id, want := range map[string]organization.SourceMode{seedFacility: organization.SourceBuddyPrimary, seedGoogleFacility: organization.SourceGooglePrimary} {
		f, err := r.GetForShare(ctx, id)
		if err != nil || f.ID != id || f.SourceMode != want {
			t.Errorf("GetForShare(%s) = %+v, %v, want %s", id, f, err, want)
		}
	}
	if _, err := r.GetForShare(ctx, unknownID); !errors.Is(err, apperr.ErrNotFound) {
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
	if len(list) != 5 {
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
	if got != (staff.Ref{ID: seedMori, FacilityID: seedFacility, TeamID: seedTeamB, Status: staff.StatusActive}) {
		t.Errorf("got %+v", got)
	}
	staffRepo := NewStaffRepository(testDB)
	if err := staffRepo.StartLeave(ctx, seedHayashi, nil); err != nil {
		t.Fatal(err)
	}
	if err := staffRepo.Retire(ctx, seedAoki); err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]staff.Status{seedHayashi: staff.StatusOnLeave, seedAoki: staff.StatusRetired} {
		if ref, err := r.Get(ctx, id); err != nil || ref.Status != want {
			t.Errorf("%s の状態 = %q, %v, want %q", id, ref.Status, err, want)
		}
	}
	// 訪問しない職員は、Ref で割り振りを拒む（ADR-0006）
	p := staff.Profile{Username: "森 健太", DepartmentID: seedDepartment, TeamID: seedTeamB, NonVisiting: true}
	if err := staffRepo.UpdateProfile(ctx, seedMori, p, seedTeamB); err != nil {
		t.Fatal(err)
	}
	got.NonVisiting = true
	if ref, err := r.Get(ctx, seedMori); err != nil || ref != got || !errors.Is(ref.RequireAssignable(), apperr.ErrInvalidInput) {
		t.Errorf("訪問しない職員の Ref = %+v, %v, want NonVisiting で割り振れない", ref, err)
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

func TestStaffFindIDBySub(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	if id, err := r.FindIDBySub(ctx, seedHayashiSub); err != nil || id != seedHayashi {
		t.Fatalf("id = %q, err = %v, want %s", id, err, seedHayashi)
	}
	if _, err := r.FindIDBySub(ctx, "sub-unknown"); !errors.Is(err, apperr.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestStaffLeave(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	returnDate := civil.Date{Year: 2027, Month: 4, Day: 1}
	if err := r.StartLeave(ctx, seedAoki, &returnDate); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedAoki)
	if err != nil || got.Status() != staff.StatusOnLeave || got.LeaveReturnDate == nil || *got.LeaveReturnDate != returnDate {
		t.Fatalf("職員 = %+v, err = %v, want 休職と戻る予定の日", got.Staff, err)
	}
	first := *got.LeaveStartedAt
	if err := r.StartLeave(ctx, seedAoki, nil); err != nil {
		t.Fatal(err)
	}
	if again, _ := r.Get(ctx, seedAoki); !again.LeaveStartedAt.Equal(first) || again.LeaveReturnDate != nil {
		t.Errorf("休職にし直した職員 = %+v, want 最初の時刻 %v のまま、戻る予定の日を消す", again.Staff, first)
	}
	list, err := r.ListByFacility(ctx, seedFacility, staff.ListQuery{Sort: kernel.Sort{Field: "updated_at", Descending: true}})
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range list {
		if (s.ID == seedAoki) != (s.Status() == staff.StatusOnLeave) {
			t.Errorf("一覧の %s の状態 = %s", s.ID, s.Status())
		}
	}
	if managers, err := r.ActiveManagers(ctx, seedFacility); err != nil || len(managers) != 0 {
		t.Errorf("休職の青木の後の有効な管理者 = %v, %v, want なし", managers, err)
	}
	if err := r.EndLeave(ctx, seedAoki); err != nil {
		t.Fatal(err)
	}
	if got, _ := r.Get(ctx, seedAoki); got.Status() != staff.StatusActive || got.LeaveReturnDate != nil {
		t.Errorf("復職の後の職員 = %+v, want 有効", got.Staff)
	}
	if managers, err := r.ActiveManagers(ctx, seedFacility); err != nil || !slices.Equal(managers, []string{seedAoki}) {
		t.Errorf("有効な管理者 = %v, %v, want 青木だけ", managers, err)
	}
	for name, err := range map[string]error{
		"StartLeave": r.StartLeave(ctx, unknownID, nil),
		"EndLeave":   r.EndLeave(ctx, unknownID),
		"Retire":     r.Retire(ctx, unknownID),
	} {
		if !errors.Is(err, apperr.ErrNotFound) {
			t.Errorf("いない職員の %s の err = %v, want ErrNotFound", name, err)
		}
	}
}

// 退職した職員は、名前を残してメールと電話番号を消し、同じメールで新しい職員を登録できる（#268 の検証の観点 4、5）。
func TestStaffRetire(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	s := staff.Staff{
		ID: "01M3TD00000000000000000030", Username: "退職 予定", Email: "retiring@example.com",
		PhoneNumber: ptr("+09000000000"), FacilityID: seedFacility,
		DepartmentID: seedDepartment, TeamID: seedTeam, PositionID: seedMember,
	}
	if err := r.Create(ctx, s, nil); err != nil {
		t.Fatal(err)
	}
	if err := r.StartLeave(ctx, s.ID, &civil.Date{Year: 2027, Month: 4, Day: 1}); err != nil {
		t.Fatal(err)
	}
	if err := r.Retire(ctx, s.ID); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, s.ID)
	if err != nil || got.Status() != staff.StatusRetired || got.Username != "退職 予定" || got.Email != "" || got.PhoneNumber != nil ||
		got.LeaveStartedAt != nil || got.LeaveReturnDate != nil {
		t.Fatalf("職員 = %+v, err = %v, want 名前を残し、メール、電話番号、休職を消す", got.Staff, err)
	}
	first := *got.RetiredAt
	if err := r.Retire(ctx, s.ID); err != nil {
		t.Fatal(err)
	}
	if again, _ := r.Get(ctx, s.ID); !again.RetiredAt.Equal(first) {
		t.Errorf("退職にし直した時刻 = %v, want 最初の %v", again.RetiredAt, first)
	}
	if err := r.StartLeave(ctx, s.ID, nil); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("退職した職員の StartLeave の err = %v, want ErrConflict", err)
	}
	if err := r.EndLeave(ctx, s.ID); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("退職した職員の EndLeave の err = %v, want ErrConflict", err)
	}
	rehired := s
	rehired.ID = "01M3TD00000000000000000031"
	if err := r.Create(ctx, rehired, nil); err != nil {
		t.Errorf("退職した職員と同じメールの Create の err = %v, want 新しい職員として書く", err)
	}
}

// 職員を休職か退職にするときに残る一覧は、予定の職員、主訪問者、同行者のどれかの、その日以降のキャンセルしていない予定と、
// その日以降に終わる繰り返しの予定と、担当の利用者である（#268 の検証の観点 1、3）。
func TestStaffAssignments(t *testing.T) {
	ctx := txContext(t)
	a := NewStaffAssignmentReader(testDB)
	from := civil.Date{Year: 2026, Month: 10, Day: 21}

	got, err := a.From(ctx, seedFacility, seedAoki, from)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Schedules) != 0 || len(got.RecurringSchedules) != 1 || got.RecurringSchedules[0].ID != seedRecurring || got.RecurringSchedules[0].EndDate != nil ||
		got.RecurringSchedules[0].StartTime != (civil.Time{Hour: 17, Minute: 30}) || len(got.Patients) != 0 {
		t.Errorf("青木 = %+v, want 前日の予定を除き、終了日の無い繰り返し", got)
	}
	got, err = a.From(ctx, seedFacility, seedMori, from)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Schedules) != 1 || got.Schedules[0].ID != seedVisitSchedule || got.Schedules[0].Date != from ||
		len(got.Patients) != 1 || got.Patients[0].Name != "見本 一郎" {
		t.Errorf("森 = %+v, want 当日の訪問の予定と担当の利用者", got)
	}
	got, err = a.From(ctx, seedFacility, seedHayashi, from)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Schedules) != 1 || got.Schedules[0].ID != seedVisitSchedule || len(got.Patients) != 1 || got.Patients[0].Name != "見本 二葉" {
		t.Errorf("林 = %+v, want 同行者の訪問の予定と担当の利用者", got)
	}

	if err := NewScheduleRepository(testDB).CreateCancel(ctx, schedule.Cancellation{ID: "01M3TD00000000000000000032", ScheduleID: seedVisitSchedule, Reason: "中止"}); err != nil {
		t.Fatal(err)
	}
	if got, err := a.From(ctx, seedFacility, seedMori, from); err != nil || len(got.Schedules) != 0 {
		t.Errorf("キャンセルの後の森の予定 = %+v, %v, want なし", got.Schedules, err)
	}
	if got, err := a.From(ctx, seedFacility, seedMori, civil.Date{Year: 2026, Month: 10, Day: 22}); err != nil || len(got.Schedules) != 0 {
		t.Errorf("翌日からの森の予定 = %+v, %v, want なし", got.Schedules, err)
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

// TestStaffUniqueness は、名前の重なりを許し、メールの重なりを事業所の中でだけ拒むことを確認する。
func TestStaffUniqueness(t *testing.T) {
	ctx := txContext(t)
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
		"INSERT INTO teams (id, facility_id, name, color) VALUES ('" + otherTeam + "', '" + otherFacility + "', 'A', 'blue')",
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
			want: []string{"中村 結衣", "佐藤 美咲", "林 さくら", "森 健太", "青木 陽菜"}},
		{name: "名前の降順", q: staff.ListQuery{Sort: kernel.Sort{Field: "username", Descending: true}},
			want: []string{"青木 陽菜", "森 健太", "林 さくら", "佐藤 美咲", "中村 結衣"}},
		{name: "チームで絞る", q: staff.ListQuery{Team: ptr("A"), Sort: kernel.Sort{Field: "username"}},
			want: []string{"中村 結衣", "林 さくら", "青木 陽菜"}},
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

// 利用者の変更、利用の終了、利用の再開を書き、利用の終了の利用者は、デフォルトの一覧と職員の担当の利用者から除く（#346、ADR-0005）。
func TestPatientUpdateEndResume(t *testing.T) {
	ctx := txContext(t)
	r := NewPatientRepository(testDB)
	err := r.Update(ctx, patient.Patient{
		ID: seedPatient, Name: "見本 一子", PreferredTime: patient.Afternoon, PreferredGender: patient.Female,
		ServiceCodeID: seedServiceCode, AssignedStaffID: seedHayashi,
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedPatient)
	if err != nil || got.Name != "見本 一子" || got.PreferredTime != patient.Afternoon || got.AssignedStaffName != "林 さくら" || got.IsEnded() {
		t.Fatalf("変えた利用者 = %+v, %v", got, err)
	}
	if err := r.Update(ctx, patient.Patient{ID: unknownID, Name: "x", PreferredTime: patient.Morning, PreferredGender: patient.Male,
		ServiceCodeID: seedServiceCode, AssignedStaffID: seedMori}); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない利用者の変更: err = %v, want ErrNotFound", err)
	}

	if err := r.End(ctx, seedPatient); err != nil {
		t.Fatal(err)
	}
	first, err := r.Get(ctx, seedPatient)
	if err != nil || first.EndedAt == nil {
		t.Fatalf("利用の終了 = %+v, %v", first.EndedAt, err)
	}
	if err := r.End(ctx, seedPatient); err != nil {
		t.Fatal(err)
	}
	if again, _ := r.Get(ctx, seedPatient); !again.EndedAt.Equal(*first.EndedAt) {
		t.Errorf("利用の終了にし直した時刻 = %v, want 最初の %v", again.EndedAt, first.EndedAt)
	}
	sort := kernel.Sort{Field: "name"}
	if rows, err := r.ListByFacility(ctx, seedFacility, patient.ListQuery{Sort: sort}); err != nil || len(rows) != 1 || rows[0].Name != "見本 二葉" {
		t.Errorf("デフォルトの一覧 = %+v, %v, want 利用中の 見本 二葉 だけ", rows, err)
	}
	if rows, err := r.ListByFacility(ctx, seedFacility, patient.ListQuery{IncludeEnded: true, Sort: sort}); err != nil || len(rows) != 2 || rows[0].EndedAt == nil {
		t.Errorf("include_ended の一覧 = %+v, %v, want 利用の終了の利用者を含む 2 人", rows, err)
	}
	a, err := NewStaffAssignmentReader(testDB).From(ctx, seedFacility, seedHayashi, civil.Date{Year: 2026, Month: 10, Day: 22})
	if err != nil || len(a.Patients) != 1 || a.Patients[0].Name != "見本 二葉" {
		t.Errorf("林の担当の利用者 = %+v, %v, want 利用の終了の 見本 一子 を除く", a.Patients, err)
	}

	if err := r.Resume(ctx, seedPatient, seedAoki); err != nil {
		t.Fatal(err)
	}
	if got, err := r.Get(ctx, seedPatient); err != nil || got.IsEnded() || got.AssignedStaffID != seedAoki {
		t.Errorf("再開した利用者 = %+v, %v, want 利用中で担当が青木", got, err)
	}
	if err := r.Resume(ctx, unknownID, seedAoki); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない利用者の再開: err = %v, want ErrNotFound", err)
	}
	if err := r.End(ctx, unknownID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない利用者の利用の終了: err = %v, want ErrNotFound", err)
	}
}

// 利用者に残る予定は、訪問の情報の利用者がその利用者の、その日以降のキャンセルしていない予定である（ADR-0005）。
func TestPatientSchedules(t *testing.T) {
	ctx := txContext(t)
	rd := NewPatientScheduleReader(testDB)
	from := civil.Date{Year: 2026, Month: 10, Day: 21}
	got, err := rd.From(ctx, seedFacility, seedPatient, from)
	if err != nil || len(got.Schedules) != 1 || got.Schedules[0].ID != seedVisitSchedule || got.Schedules[0].StartTime != (civil.Time{Hour: 9, Minute: 30}) ||
		len(got.RecurringSchedules) != 0 {
		t.Fatalf("当日から = %+v, %v, want 訪問の予定 1 件", got, err)
	}
	if got, err := rd.From(ctx, seedFacility, seedPatient, civil.Date{Year: 2026, Month: 10, Day: 22}); err != nil || !got.IsEmpty() {
		t.Errorf("翌日から = %+v, %v, want なし", got, err)
	}
	if got.Schedules[0].EndsNextDay {
		t.Errorf("同じ日に終わる予定の EndsNextDay = true, want false（#923）")
	}
	tx := ctx.Value(txKey{}).(pgx.Tx)
	if _, err := tx.Exec(ctx, "UPDATE schedules SET start_time = '22:00', end_time = '01:00', ends_next_day = true WHERE id = $1", seedVisitSchedule); err != nil {
		t.Fatal(err)
	}
	if got, err := rd.From(ctx, seedFacility, seedPatient, from); err != nil || len(got.Schedules) != 1 || !got.Schedules[0].EndsNextDay {
		t.Errorf("翌日に終わる予定 = %+v, %v, want EndsNextDay が true（#923）", got, err)
	}
	info := visit.Info{
		ID: "01M3TD000000000000000000J0", FacilityID: seedFacility, PatientID: seedPatient, AssignedStaffID: seedMori,
		ServiceCodeID: seedServiceCode,
	}
	if err := NewVisitInfoRepository(testDB).Create(ctx, info); err != nil {
		t.Fatal(err)
	}
	rs := schedule.RecurringSchedule{
		ID: "01M3TD000000000000000000J1",
		Slot: schedule.Slot{
			FacilityID: seedFacility, StaffID: seedMori, TypeID: seedVisitType, Date: from,
			StartTime: civil.Time{Hour: 22}, EndTime: civil.Time{Hour: 1}, EndsNextDay: true, VisitInfoID: &info.ID,
		},
		Rule: schedule.Rule{Frequency: schedule.Weekly},
	}
	if err := NewRecurringScheduleRepository(testDB).Create(ctx, rs); err != nil {
		t.Fatal(err)
	}
	if got, err := rd.From(ctx, seedFacility, seedPatient, from); err != nil || len(got.RecurringSchedules) != 1 || !got.RecurringSchedules[0].EndsNextDay {
		t.Errorf("翌日に終わる繰り返しの予定 = %+v, %v, want EndsNextDay が true（#923）", got.RecurringSchedules, err)
	}
	if err := NewScheduleRepository(testDB).CreateCancel(ctx, schedule.Cancellation{ID: "01M3TD00000000000000000033", ScheduleID: seedVisitSchedule, Reason: "中止"}); err != nil {
		t.Fatal(err)
	}
	if got, err := rd.From(ctx, seedFacility, seedPatient, from); err != nil || len(got.Schedules) != 0 {
		t.Errorf("キャンセルの後の単発の予定 = %+v, %v, want なし", got.Schedules, err)
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
	found, err := NewVisitCategoryRepository(testDB).ListByIDs(ctx, []string{seedNight, unknownID})
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
	// 書き込みのモデルは、名前を結合せず、同じ予定と訪問の情報の ID を返す
	stored, err := r.GetForUpdate(ctx, seedVisitSchedule)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stored.Schedule, got.Schedule) || stored.Cancelled || stored.Version != got.Version {
		t.Errorf("GetForUpdate = %+v, want %+v", stored, got.Schedule)
	}
	if sv := stored.Visit; sv == nil || sv.ID != v.ID || sv.FacilityID != seedFacility || sv.PatientID != v.PatientID ||
		sv.AssignedStaffID != v.AssignedStaffID || sv.CompanionID == nil || *sv.CompanionID != *v.CompanionID ||
		sv.ServiceCodeID != v.ServiceCodeID || !slices.Equal(sv.CategoryIDs, []string{v.Categories[0].ID}) {
		t.Errorf("GetForUpdate の Visit = %+v, want %+v", sv, v)
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
		q    scheduleview.ListQuery
		want []string
	}{
		{name: "日付と開始の時刻の昇順", q: scheduleview.ListQuery{Sort: kernel.Sort{Field: "date"}},
			want: []string{late.ID, seedConference, seedVisitSchedule}},
		{name: "日付と開始の時刻の降順", q: scheduleview.ListQuery{Sort: kernel.Sort{Field: "date", Descending: true}},
			want: []string{seedVisitSchedule, seedConference, late.ID}},
		{name: "開始の時刻の昇順", q: scheduleview.ListQuery{Sort: kernel.Sort{Field: "start_time"}},
			want: []string{late.ID, seedVisitSchedule, seedConference}},
		{name: "種類で絞る", q: scheduleview.ListQuery{TypeName: &visitName, Sort: kernel.Sort{Field: "date"}},
			want: []string{seedVisitSchedule}},
		{name: "日付で絞る", q: scheduleview.ListQuery{DateFrom: &day, DateTo: &day, Sort: kernel.Sort{Field: "date"}},
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

// TestScheduleEndsNextDay は、翌日に終わる予定の印を保存して読み、期間の一覧が前の日に始まる印の付いた予定も返し、
// 時刻の制約が印に合わない予定を拒むことを確認する（ADR-0033）。
func TestScheduleEndsNextDay(t *testing.T) {
	ctx := txContext(t)
	r := NewScheduleRepository(testDB)
	nov1 := civil.Date{Year: 2026, Month: 11, Day: 1}
	nov2 := civil.Date{Year: 2026, Month: 11, Day: 2}
	slot := func(d civil.Date, start, end int, next bool) schedule.Slot {
		return schedule.Slot{
			FacilityID: seedFacility, StaffID: seedHayashi, TypeID: seedNormalType,
			Date: d, StartTime: civil.Time{Hour: start}, EndTime: civil.Time{Hour: end}, EndsNextDay: next,
			Title: ptr("夜勤"),
		}
	}
	overnight := schedule.Schedule{ID: "01M3TD000000000000000000F0", Slot: slot(nov1, 22, 1, true)}
	evening := schedule.Schedule{ID: "01M3TD000000000000000000F1", Slot: slot(nov1, 20, 21, false)}
	twoDaysBefore := schedule.Schedule{ID: "01M3TD000000000000000000F2", Slot: slot(civil.Date{Year: 2026, Month: 10, Day: 31}, 22, 1, true)}
	for _, s := range []schedule.Schedule{overnight, evening, twoDaysBefore} {
		if err := r.Create(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	got, err := r.Get(ctx, overnight.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.EndsNextDay || got.Date != nov1 || got.EndTime != (civil.Time{Hour: 1}) || !got.IsOverTimeWork {
		t.Errorf("got %+v", got.Slot)
	}
	assigned, err := NewStaffAssignmentReader(testDB).From(ctx, seedFacility, seedHayashi, nov1)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range assigned.Schedules {
		if s.EndsNextDay != (s.ID == overnight.ID) {
			t.Errorf("残る予定 %s の EndsNextDay = %v", s.ID, s.EndsNextDay)
		}
	}

	rows, err := r.ListByFacility(ctx, seedFacility, scheduleview.ListQuery{DateFrom: &nov2, DateTo: &nov2, Sort: kernel.Sort{Field: "date"}})
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]string, len(rows))
	for i, s := range rows {
		ids[i] = s.ID
	}
	if !slices.Contains(ids, overnight.ID) || slices.Contains(ids, evening.ID) || slices.Contains(ids, twoDaysBefore.ID) {
		t.Errorf("11 月 2 日の一覧 = %v, want %s を含み %s と %s を含まない", ids, overnight.ID, evening.ID, twoDaysBefore.ID)
	}

	overnight.Slot = slot(nov1, 20, 21, false)
	if err := r.Update(ctx, overnight); err != nil {
		t.Fatal(err)
	}
	if got, err := r.Get(ctx, overnight.ID); err != nil || got.EndsNextDay {
		t.Errorf("印を外した予定: EndsNextDay = %v, err = %v", got.EndsNextDay, err)
	}

	tests := []struct {
		id   string
		name string
		slot schedule.Slot
	}{
		{id: "01M3TD000000000000000000G0", name: "印を付けずに終了が開始より前", slot: slot(nov1, 22, 1, false)},
		{id: "01M3TD000000000000000000G1", name: "印を付けて終了が開始より後", slot: slot(nov1, 9, 10, true)},
		{id: "01M3TD000000000000000000G2", name: "印を付けて開始と終了が同じ", slot: slot(nov1, 9, 9, true)},
		{id: "01M3TD000000000000000000G3", name: "印を付けずに開始と終了が同じ", slot: slot(nov1, 9, 9, false)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := schedule.Schedule{ID: tt.id, Slot: tt.slot}
			if err := r.Create(ctx, s); !errors.Is(err, apperr.ErrInvalidInput) {
				t.Fatalf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}

// TestRecurringScheduleEndsNextDay は、繰り返しの予定の翌日に終わる印を保存して読むことと、時刻の制約が印に合わない予定を拒むことを確認する。
func TestRecurringScheduleEndsNextDay(t *testing.T) {
	ctx := txContext(t)
	r := NewRecurringScheduleRepository(testDB)
	rs := schedule.RecurringSchedule{
		ID: "01M3TD000000000000000000H0",
		Slot: schedule.Slot{
			FacilityID: seedFacility, StaffID: seedMori, TypeID: seedNormalType,
			Date: civil.Date{Year: 2026, Month: 11, Day: 2}, StartTime: civil.Time{Hour: 22}, EndTime: civil.Time{Hour: 0},
			EndsNextDay: true, Title: ptr("夜勤"),
		},
		Rule: schedule.Rule{Frequency: schedule.Weekly},
	}
	if err := r.Create(ctx, rs); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, rs.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.EndsNextDay || got.EndTime != (civil.Time{}) {
		t.Errorf("got %+v", got.Slot)
	}
	list, err := r.ListByFacility(ctx, seedFacility, scheduleview.ListQuery{Sort: kernel.Sort{Field: "date"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range list {
		if d.EndsNextDay != (d.ID == rs.ID) {
			t.Errorf("%s の EndsNextDay = %v", d.ID, d.EndsNextDay)
		}
	}
	assigned, err := NewStaffAssignmentReader(testDB).From(ctx, seedFacility, seedMori, rs.Date)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(assigned.RecurringSchedules, func(r staff.AssignedRecurring) bool { return r.ID == rs.ID && r.EndsNextDay }) {
		t.Errorf("残る繰り返しの予定 = %+v, want %s の EndsNextDay が true", assigned.RecurringSchedules, rs.ID)
	}
	for _, r := range assigned.RecurringSchedules {
		if r.ID != rs.ID && r.EndsNextDay {
			t.Errorf("残る繰り返しの予定 %s の EndsNextDay = true", r.ID)
		}
	}

	rs.ID, rs.EndsNextDay = "01M3TD000000000000000000H1", false
	if err := r.Create(ctx, rs); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("印のない 22:00 から 0:00: err = %v, want ErrInvalidInput", err)
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
	if stored, err := r.GetForUpdate(ctx, rs.ID); err != nil || !reflect.DeepEqual(stored.RecurringSchedule, got.RecurringSchedule) ||
		stored.Version != got.Version || stored.Visit != nil {
		t.Errorf("GetForUpdate = %+v, %v, want %+v", stored, err, got.RecurringSchedule)
	}

	list, err := r.ListByFacility(ctx, seedFacility, scheduleview.ListQuery{Sort: kernel.Sort{Field: "date"}})
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

// TestRecurringScheduleUpdateRule は、規則の書き換えが最初の日付、規則、更新の番号を変え、
// 除外する日の削除が、置き換えた回の単発の予定がある日と、from より前の日を残すことを確認する（ADR-0037）。
func TestRecurringScheduleUpdateRule(t *testing.T) {
	ctx := txContext(t)
	r := NewRecurringScheduleRepository(testDB)
	rs := schedule.RecurringSchedule{
		ID: "01M3TD00000000000000000051",
		Slot: schedule.Slot{
			FacilityID: seedFacility, StaffID: seedMori, TypeID: seedNormalType,
			Date: civil.Date{Year: 2026, Month: 11, Day: 2}, StartTime: civil.Time{Hour: 13}, EndTime: civil.Time{Hour: 14},
			Title: ptr("定例"),
		},
		Rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{1}},
	}
	if err := r.Create(ctx, rs); err != nil {
		t.Fatal(err)
	}
	before, replacedDay, cancelledDay := civil.Date{Year: 2026, Month: 11, Day: 2}, civil.Date{Year: 2026, Month: 11, Day: 9}, civil.Date{Year: 2026, Month: 11, Day: 16}
	for _, d := range []civil.Date{before, replacedDay, cancelledDay} {
		if err := r.AddExclusion(ctx, rs.ID, d); err != nil {
			t.Fatal(err)
		}
	}
	replaced := schedule.Schedule{ID: "01M3TD000000000000000000E2", Slot: rs.Slot, RecurringScheduleID: &rs.ID, OriginalDate: &replacedDay}
	replaced.Date = replacedDay
	if err := NewScheduleRepository(testDB).Create(ctx, replaced); err != nil {
		t.Fatal(err)
	}
	v0, err := r.Get(ctx, rs.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := r.ReplacedDates(ctx, rs.ID, before); err != nil || !reflect.DeepEqual(got, []civil.Date{replacedDay}) {
		t.Errorf("ReplacedDates = %v, %v, want [%v]", got, err, replacedDay)
	}
	if got, err := r.ReplacedDates(ctx, rs.ID, cancelledDay); err != nil || len(got) != 0 {
		t.Errorf("%v 以降の ReplacedDates = %v, %v, want 無し", cancelledDay, got, err)
	}

	changed := rs
	changed.Date = civil.Date{Year: 2026, Month: 11, Day: 3}
	changed.Rule = schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{2}, Interval: 1, EndDate: &civil.Date{Year: 2027, Month: 3, Day: 30}}
	if err := r.UpdateRule(ctx, changed); err != nil {
		t.Fatal(err)
	}
	if err := r.RemoveUnreplacedExclusions(ctx, rs.ID, replacedDay); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, rs.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Date != changed.Date || !reflect.DeepEqual(got.Rule, changed.Rule) || got.Version != v0.Version+1 || *got.Title != "定例" {
		t.Errorf("書き換えた繰り返しの予定 = %+v, want 最初の日付 %v、規則 %+v、番号 %d", got, changed.Date, changed.Rule, v0.Version+1)
	}
	if want := []civil.Date{before, replacedDay}; !reflect.DeepEqual(got.ExclusionDates, want) {
		t.Errorf("ExclusionDates = %v, want %v", got.ExclusionDates, want)
	}
}

func TestScheduleCancel(t *testing.T) {
	ctx := txContext(t)
	r := NewScheduleRepository(testDB)
	c := schedule.Cancellation{ID: "01M3TD00000000000000000060", ScheduleID: seedConference, Reason: "体調不良"}
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
	if stored, err := r.GetForUpdate(ctx, seedConference); err != nil || !stored.Cancelled || stored.Version != got.Version || stored.Visit != nil {
		t.Errorf("キャンセルした後の GetForUpdate = %+v, %v, want キャンセル済みで更新の番号 %d", stored, err, got.Version)
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
			schedule.Cancellation{ID: "01M3TD00000000000000000070", ScheduleID: seedConference, Reason: "体調不良"})
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

// 予定と担当の新しい割り振りの Share と、休職と退職の Lock は、互いをトランザクションの終わりまで待たせる。
// 割り振りどうしは待たせない。退職の残る予定の確認と、予定の作成が行き違わないことを確認する（#269）。
func TestFacilityShareAndLockWaitForEachOther(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	bg := context.Background()
	facilities := NewFacilityRepository(testDB)
	begin := func(t *testing.T) context.Context {
		t.Helper()
		tx, err := testDB.Begin(bg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = tx.Rollback(bg) })
		return context.WithValue(bg, txKey{}, tx)
	}
	rollback := func(t *testing.T, ctx context.Context) {
		t.Helper()
		if err := ctx.Value(txKey{}).(pgx.Tx).Rollback(bg); err != nil {
			t.Fatal(err)
		}
	}
	// waits は、first のロックを持つ間、second が終わらず、first をロールバックすると終わることを確認する。
	waits := func(t *testing.T, first, second func(ctx context.Context) error) {
		t.Helper()
		holder, waiter := begin(t), begin(t)
		if err := first(holder); err != nil {
			t.Fatal(err)
		}
		done := make(chan error, 1)
		go func() { done <- second(waiter) }()
		select {
		case err := <-done:
			t.Fatalf("ロックの間に終わった: err = %v", err)
		case <-time.After(300 * time.Millisecond):
		}
		rollback(t, holder)
		if err := <-done; err != nil {
			t.Fatal(err)
		}
		rollback(t, waiter)
	}
	share := func(ctx context.Context) error { return facilities.Share(ctx, seedFacility) }
	lock := func(ctx context.Context) error { return facilities.Lock(ctx, seedFacility) }

	t.Run("割り振りの間は、休職と退職が待つ", func(t *testing.T) { waits(t, share, lock) })
	t.Run("休職と退職の間は、割り振りが待つ", func(t *testing.T) { waits(t, lock, share) })
	t.Run("割り振りどうしは待たない", func(t *testing.T) {
		a, b := begin(t), begin(t)
		if err := share(a); err != nil {
			t.Fatal(err)
		}
		// 待つと、上限の時間で失敗する
		b, cancel := context.WithTimeout(b, 5*time.Second)
		defer cancel()
		if err := share(b); err != nil {
			t.Fatal(err)
		}
	})
	if err := facilities.Share(begin(t), unknownID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない事業所の Share の err = %v, want ErrNotFound", err)
	}
	if err := facilities.Lock(begin(t), unknownID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない事業所の Lock の err = %v, want ErrNotFound", err)
	}
}

// 職員の管理の権限を持つ有効な職員が 2 人の事業所で、2 人から同時にその権限を外そうとしたとき、少なくとも 1 人に権限が残る
// （#279 の検証の観点 4）。権限を外す操作と役職を変える操作が同時のときも同じである。
func TestStaffConcurrentRemovalKeepsManager(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	bg := context.Background()
	const (
		facility  = "01M3TD0000000000000000RF01"
		dept      = "01M3TD0000000000000000RD01"
		team      = "01M3TD0000000000000000RT01"
		managerP  = "01M3TD0000000000000000RP01"
		memberP   = "01M3TD0000000000000000RP02"
		a, b      = "01M3TD0000000000000000RS01", "01M3TD0000000000000000RS02"
		upA, upB  = "01M3TD0000000000000000RG01", "01M3TD0000000000000000RG02"
		rounds    = 10
		facilityN = "同時の操作の事業所"
	)
	exec := func(t *testing.T, sql string, args ...any) {
		t.Helper()
		if _, err := testDB.Exec(bg, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	cleanup := func(t *testing.T) {
		exec(t, `DELETE FROM permission_audits WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM users WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM positions WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM teams WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM departments WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM facilities WHERE id = $1`, facility)
	}
	// setup は、職員 a と b が職員の管理の権限を持つ有効な職員の事業所をコミットして作る。
	setup := func(t *testing.T) {
		t.Helper()
		cleanup(t)
		exec(t, `INSERT INTO facilities (id, name) VALUES ($1, $2)`, facility, facilityN)
		exec(t, `INSERT INTO departments (id, facility_id, name) VALUES ($1, $2, '部署')`, dept, facility)
		exec(t, `INSERT INTO teams (id, facility_id, name, color) VALUES ($1, $2, 'チーム', 'blue')`, team, facility)
		exec(t, `INSERT INTO positions (id, facility_id, name) VALUES ($1, $3, '管理者'), ($2, $3, 'メンバー')`, managerP, memberP, facility)
		exec(t, `INSERT INTO position_policies (position_id, policy_id) VALUES ($1, $3), ($2, $4)`, managerP, memberP, seedStaffManage, seedSelfEdit)
		exec(t, `INSERT INTO users (id, facility_id, username, email, department_id, team_id, position_id) VALUES
			($1, $3, '管理者 一', 'concurrent-a@example.com', $4, $5, $6), ($2, $3, '管理者 二', 'concurrent-b@example.com', $4, $5, $6)`,
			a, b, facility, dept, team, managerP)
		exec(t, `INSERT INTO user_policies (id, facility_id, user_id, policy_id) VALUES ($1, $3, $4, $6), ($2, $3, $5, $6)`,
			upA, upB, facility, a, b, seedStaffManage)
	}
	t.Cleanup(func() { cleanup(t) })

	allow := func(context.Context) error { return nil }
	// 記録は、操作した職員を b にし、操作ごとに別の相関 ID で書く。
	rec := audit.NewRecorder(NewPermissionAuditRepository(testDB), ulid.Generator{}, func(context.Context) (string, bool) { return b, true })
	removeGrant := staff.NewRemoveGrant(NewStaffRepository(testDB), NewFacilityRepository(testDB), rec, NewTransactor(testDB), allow)
	changePosition := staff.NewChangePosition(NewStaffRepository(testDB), NewFacilityRepository(testDB), NewPositionRepository(testDB), rec, NewTransactor(testDB), ulid.Generator{}, allow)
	// race は、first と second を同時に始め、片方だけが成功して片方が ErrConflict になり、権限を持つ有効な職員が 1 人残ることを確認する。
	race := func(t *testing.T, first, second func(ctx context.Context) error) {
		t.Helper()
		for range rounds {
			setup(t)
			start := make(chan struct{})
			errs := make(chan error, 2)
			for _, op := range []func(ctx context.Context) error{first, second} {
				go func() {
					<-start
					errs <- op(audit.WithRequestID(bg, ulid.Generator{}.NewID()))
				}()
			}
			close(start)
			var conflicts, succeeded int
			for range 2 {
				switch err := <-errs; {
				case err == nil:
					succeeded++
				case errors.Is(err, apperr.ErrConflict):
					conflicts++
				default:
					t.Fatal(err)
				}
			}
			managers, err := NewStaffRepository(testDB).ActiveManagers(bg, facility)
			if err != nil {
				t.Fatal(err)
			}
			if succeeded != 1 || conflicts != 1 || len(managers) != 1 {
				t.Fatalf("成功 = %d, ErrConflict = %d, 有効な管理者 = %v, want 1 つずつで 1 人が残る", succeeded, conflicts, managers)
			}
		}
	}
	removeA := func(ctx context.Context) error { _, err := removeGrant.Do(ctx, a, upA); return err }

	t.Run("2 人の職員の管理の権限を同時に外しても 1 人に権限が残る", func(t *testing.T) {
		race(t, removeA, func(ctx context.Context) error { _, err := removeGrant.Do(ctx, b, upB); return err })
	})
	t.Run("権限を外す操作と役職を変える操作が同時でも 1 人に権限が残る", func(t *testing.T) {
		race(t, removeA, func(ctx context.Context) error { _, err := changePosition.Do(ctx, b, memberP); return err })
	})
}

// slowStaffRefs は、職員の状態を読んでから 100 ミリ秒待つ StaffRefRepository である。予定の作成が職員の状態を確認してから
// 予定を書くまでの間を広げる。
type slowStaffRefs struct{ *StaffRefRepository }

func (r slowStaffRefs) Get(ctx context.Context, id string) (staff.Ref, error) {
	ref, err := r.StaffRefRepository.Get(ctx, id)
	time.Sleep(100 * time.Millisecond)
	return ref, err
}

// slowAssignments は、50 ミリ秒待ってから残る予定を読む StaffAssignmentReader である。ロックが無ければ、退職が残る予定を
// 読むのは、予定の作成が職員の状態を確認した後で、予定を書く前になる。
type slowAssignments struct{ *StaffAssignmentReader }

func (r slowAssignments) From(ctx context.Context, facilityID, staffID string, from civil.Date) (staff.Assignments, error) {
	time.Sleep(50 * time.Millisecond)
	return r.StaffAssignmentReader.From(ctx, facilityID, staffID, from)
}

// 職員を退職にする操作と、その職員に予定を作る操作を同時に送ったとき、どちらか一方が先に終わり、
// 退職した職員に今日以降の予定が作られない（#615 の検証の観点 1）。
func TestStaffConcurrentRetireAndScheduleCreate(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	bg := context.Background()
	const (
		facility = "01M3TD0000000000000000QF01"
		dept     = "01M3TD0000000000000000QD01"
		team     = "01M3TD0000000000000000QT01"
		position = "01M3TD0000000000000000QP01"
		target   = "01M3TD0000000000000000QS01"
		rounds   = 10
	)
	exec := func(t *testing.T, sql string, args ...any) {
		t.Helper()
		if _, err := testDB.Exec(bg, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	cleanup := func(t *testing.T) {
		exec(t, `DELETE FROM schedules WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM users WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM positions WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM teams WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM departments WHERE facility_id = $1`, facility)
		exec(t, `DELETE FROM facilities WHERE id = $1`, facility)
	}
	// setup は、予定の無い有効な職員 target の事業所をコミットして作る。
	setup := func(t *testing.T) {
		t.Helper()
		cleanup(t)
		exec(t, `INSERT INTO facilities (id, name, source_mode) VALUES ($1, '退職と予定の事業所', 'buddy_primary')`, facility)
		exec(t, `INSERT INTO departments (id, facility_id, name) VALUES ($1, $2, '部署')`, dept, facility)
		exec(t, `INSERT INTO teams (id, facility_id, name, color) VALUES ($1, $2, 'チーム', 'blue')`, team, facility)
		exec(t, `INSERT INTO positions (id, facility_id, name) VALUES ($1, $2, 'メンバー')`, position, facility)
		exec(t, `INSERT INTO users (id, facility_id, username, email, department_id, team_id, position_id)
			VALUES ($1, $2, '退職 予定', 'retire-race@example.com', $3, $4, $5)`, target, facility, dept, team, position)
	}
	t.Cleanup(func() { cleanup(t) })

	txr := NewTransactor(testDB)
	retire := staff.NewRetire(nil, NewStaffRepository(testDB), NewFacilityRepository(testDB), slowAssignments{NewStaffAssignmentReader(testDB)}, nil, nil,
		NewCalendarRepository(testDB), txr, func(context.Context) error { return nil })
	create := schedule.NewCreate(NewFacilityRepository(testDB), NewScheduleRepository(testDB), NewScheduleTypeRepository(testDB),
		slowStaffRefs{NewStaffRefRepository(testDB)}, NewFacilityRepository(testDB), nil, nil, nil, txr, ulid.Generator{})
	editor := principal.With(bg, principal.Principal{Staff: principal.Staff{
		ID: "EDITOR", FacilityID: facility,
		Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}},
	}})
	today := civil.Today(time.Now())
	title := "退職と同時の予定"
	in := schedule.SlotInput{
		TypeID: seedNormalType, Date: today, StaffID: target, Title: &title,
		StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10},
	}

	for range rounds {
		setup(t)
		start := make(chan struct{})
		retireErr, createErr := make(chan error, 1), make(chan error, 1)
		go func() {
			<-start
			_, err := retire.Do(bg, target)
			retireErr <- err
		}()
		go func() {
			<-start
			_, err := create.Do(editor, facility, in)
			createErr <- err
		}()
		close(start)
		rErr, cErr := <-retireErr, <-createErr

		var assigned *staff.AssignedError
		switch {
		case rErr == nil && errors.Is(cErr, apperr.ErrInvalidInput) && strings.Contains(cErr.Error(), "退職した職員"):
			// 退職が先に終わり、予定の作成が退職した職員を拒んだ
		case errors.As(rErr, &assigned) && cErr == nil:
			// 予定の作成が先に終わり、退職が残る予定で拒まれた
		default:
			t.Fatalf("退職の err = %v, 予定の作成の err = %v, want どちらか一方だけが成功する", rErr, cErr)
		}
		got, err := NewStaffRepository(testDB).Get(bg, target)
		if err != nil {
			t.Fatal(err)
		}
		a, err := NewStaffAssignmentReader(testDB).From(bg, facility, target, today)
		if err != nil {
			t.Fatal(err)
		}
		if got.RetiredAt != nil && !a.IsEmpty() {
			t.Fatalf("退職した職員に今日以降の予定が残る: %+v", a)
		}
	}
}

func TestTransactorRollsBack(t *testing.T) {
	if testDB == nil {
		t.Skip("PostgreSQL を使うテストは -short では動かさない")
	}
	ctx := context.Background()
	teams := NewTeamRepository(testDB)
	team := organization.Team{ID: "01M3TD00000000000000000070", FacilityID: seedFacility, Name: "ロールバック", Color: organization.TeamColorBlue}
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
		organization.ReceiptCheck:     false,
	}
	if len(got) != len(want) || !maps.Equal(needsTarget, want) {
		t.Errorf("権限 = %+v", got)
	}
}

// TestStaffCreateRejectsTarget は、対象の職員とチームの両方か、どちらも持たない対象を DB が拒むことを確認する。
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

// TestStaffChangePosition は、役職を変えると、消すと渡した権限だけが対象ごと消え、ほかの権限は行のまま残り、渡した権限が足されることを確認する。
func TestStaffChangePosition(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	// 森はリーダーで、自分の予定の編集と、所属のチームを対象にするチームの予定の閲覧と編集を持つ
	const kept = "01M3TC5ZMRRY639KSB3B4T0V19"
	target := staff.Target{ID: "01M3TD00000000000000000031", UserID: seedHayashi}
	grants := []staff.Grant{{ID: "01M3TD00000000000000000030", PolicyID: seedUserRead, Targets: []staff.Target{target}}}
	if err := r.ChangePosition(ctx, seedMori, seedMember, []string{seedTeamRead, seedTeamEdit}, grants); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	if got.PositionID != seedMember || got.PositionName != "メンバー" {
		t.Errorf("役職 = %s %s", got.PositionID, got.PositionName)
	}
	ids := map[string]staff.PolicyGrant{}
	for _, p := range got.Policies {
		ids[p.PolicyID] = p
	}
	if len(ids) != 2 || ids[seedSelfEdit].UserPolicyID != kept || ids[seedUserRead].UserPolicyID != grants[0].ID ||
		len(ids[seedUserRead].TargetUserIDs) != 1 || ids[seedUserRead].TargetUserIDs[0] != seedHayashi {
		t.Errorf("Policies = %+v, want 残した自分の予定の編集と、足した林の予定の閲覧", got.Policies)
	}
	var targets int
	tx := ctx.Value(txKey{}).(pgx.Tx)
	if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM user_policy_targets upt JOIN user_policies up ON up.id = upt.user_policy_id WHERE up.user_id = $1", seedMori).Scan(&targets); err != nil {
		t.Fatal(err)
	}
	if targets != 1 {
		t.Errorf("森の対象のレコード = %d, want 足した林の 1 つ", targets)
	}
}

// TestStaffUpdateProfile は、職員の名前、電話番号、部署、チーム、訪問しない職員かを書き、古いチームを指す対象を新しいチームに移し、
// 新しいチームを既に対象にする権限では古いチームの対象を消すことと、退職した職員と無い職員を拒むことを確認する。
func TestStaffUpdateProfile(t *testing.T) {
	ctx := txContext(t)
	r := NewStaffRepository(testDB)
	before, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	var teamRead string
	for _, p := range before.Policies {
		if p.PolicyID == seedTeamRead {
			teamRead = p.UserPolicyID
		}
	}
	tx := ctx.Value(txKey{}).(pgx.Tx)
	if _, err := tx.Exec(ctx, "INSERT INTO user_policy_targets (id, facility_id, user_policy_id, target_team_id) VALUES ($1, $2, $3, $4)",
		"01M3TD00000000000000000040", seedFacility, teamRead, seedTeam); err != nil {
		t.Fatal(err)
	}
	phone := "+819012345678"
	p := staff.Profile{Username: "森 新", PhoneNumber: &phone, DepartmentID: seedDepartment, TeamID: seedTeam, NonVisiting: true}
	if err := r.UpdateProfile(ctx, seedMori, p, seedTeamB); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, seedMori)
	if err != nil {
		t.Fatal(err)
	}
	if got.Username != "森 新" || got.PhoneNumber == nil || *got.PhoneNumber != phone || got.TeamID != seedTeam || !got.NonVisiting || got.Email == "" {
		t.Errorf("職員 = %+v, want 名前、電話番号、チーム、訪問しない職員かだけが変わる", got.Summary)
	}
	for _, g := range got.Policies {
		if (g.PolicyID == seedTeamRead || g.PolicyID == seedTeamEdit) && !slices.Equal(g.TargetTeamIDs, []string{seedTeam}) {
			t.Errorf("チームの権限 %s の対象 = %v, want 新しいチームだけ", g.PolicyID, g.TargetTeamIDs)
		}
	}

	if err := r.Retire(ctx, seedHayashi); err != nil {
		t.Fatal(err)
	}
	if err := r.UpdateProfile(ctx, seedHayashi, p, seedTeam); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("退職した職員: err = %v, want ErrConflict", err)
	}
	if err := r.UpdateProfile(ctx, unknownID, p, seedTeam); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}

// TestStaffAddAndRemoveGrant は、権限と対象を足し、同じ権限の 2 つ目を拒み、外すと対象も消えることを確認する。
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

// TestGrantAllowsReadingTarget は、職員の権限を足すと、DB から読み直した職員の判定で対象の職員の予定を見られることを確認する。
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
	if schedule.CanRead(principal.Principal{Staff: principal.StaffOf(before)}, hayashi.ID, hayashi.TeamID) {
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
	p := principal.Principal{Staff: principal.StaffOf(after)}
	if !schedule.CanRead(p, hayashi.ID, hayashi.TeamID) || schedule.CanEdit(p, hayashi.ID, hayashi.TeamID) {
		t.Errorf("森の権限 = %+v, want 林の予定の閲覧だけ", after.Policies)
	}
}

// TestNamesAreComparedExactly は、名前の一意の制約と絞り込みが、清音と濁音、全角と半角、大文字と小文字を別の名前とみなすことを確認する。
func TestNamesAreComparedExactly(t *testing.T) {
	ctx := txContext(t)
	r := NewTeamRepository(testDB)
	for i, name := range []string{"ハ", "バ", "ﾊ", "a", "Ａ"} {
		team := organization.Team{ID: "01M3TD000000000000000000A" + string(rune('0'+i)), FacilityID: seedFacility, Name: name, Color: organization.TeamColorBlue}
		if err := r.Create(ctx, team); err != nil {
			t.Fatalf("チーム %q: err = %v", name, err)
		}
	}
	dup := organization.Team{ID: "01M3TD000000000000000000B0", FacilityID: seedFacility, Name: "バ", Color: organization.TeamColorBlue}
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

// TestTeamUpdate は、チームの名前と色を変え、ほかのチームと同じ名前と 8 色にない色を拒むことを確認する。
func TestTeamUpdate(t *testing.T) {
	ctx := txContext(t)
	r := NewTeamRepository(testDB)
	team := organization.Team{ID: "01M3TD000000000000000000H0", FacilityID: seedFacility, Name: "外来", Color: organization.TeamColorCyan}
	if err := r.Create(ctx, team); err != nil {
		t.Fatal(err)
	}
	if got, err := r.Get(ctx, team.ID); err != nil || got.Color != organization.TeamColorCyan {
		t.Fatalf("Get = %+v, %v, want cyan", got, err)
	}
	team.Name, team.Color = "訪問", organization.TeamColorLime
	if err := r.Update(ctx, team); err != nil {
		t.Fatal(err)
	}
	if got, err := r.Get(ctx, team.ID); err != nil || got.Name != "訪問" || got.Color != organization.TeamColorLime {
		t.Errorf("変えた後の Get = %+v, %v", got, err)
	}
	team.Name = "A"
	if err := r.Update(ctx, team); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("シードのチーム A と同じ名前: err = %v, want ErrConflict", err)
	}
	if err := r.Update(ctx, organization.Team{ID: "01M3TD000000000000000000H1", Name: "無い", Color: organization.TeamColorBlue}); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無いチーム: err = %v, want ErrNotFound", err)
	}
	if err := r.Create(ctx, organization.Team{ID: "01M3TD000000000000000000H2", FacilityID: seedFacility, Name: "赤", Color: "red"}); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("8 色にない色: err = %v, want ErrInvalidInput", err)
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

// TestScheduleRejectsOtherFacilityStaff は、複合の外部キーが、別の事業所の職員を指す予定を拒むことを確認する。
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
		"INSERT INTO teams (id, facility_id, name, color) VALUES ('" + otherTeam + "', '" + otherFacility + "', 'A', 'blue')",
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

// TestScheduleColumnsFromDB は、時間外の勤務を開始の時刻から DB が決めることと、置き換えた回の組と訪問の情報が予定ごとに一意であることを確認する。
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

// TestExternalCalendarsOneActivePerStaff は、職員ごとに 1 つの外部のカレンダーの制約が、外していないレコードだけに当たることを確認する。
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
	team := organization.Team{ID: "01M3TD000000000000000000G0", FacilityID: seedFacility, Name: "a\x00b", Color: organization.TeamColorBlue}
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

// TestDepartmentCreateAndUpdate は、部署を作って名前を変え、同じ事業所のほかの部署と同じ名前と無い部署を拒むことを確認する。
func TestDepartmentCreateAndUpdate(t *testing.T) {
	ctx := txContext(t)
	r := NewDepartmentRepository(testDB)
	dep := organization.Department{ID: "01M3TD000000000000000000J0", FacilityID: seedFacility, Name: "外来"}
	if err := r.Create(ctx, dep); err != nil {
		t.Fatal(err)
	}
	if err := r.Create(ctx, organization.Department{ID: "01M3TD000000000000000000J1", FacilityID: seedFacility, Name: "看護"}); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("シードの部署 看護 と同じ名前で作る: err = %v, want ErrConflict", err)
	}
	dep.Name = "訪問"
	if err := r.Update(ctx, dep); err != nil {
		t.Fatal(err)
	}
	if got, err := r.Get(ctx, dep.ID); err != nil || got.Name != "訪問" || got.FacilityID != seedFacility {
		t.Errorf("変えた後の Get = %+v, %v", got, err)
	}
	dep.Name = "看護"
	if err := r.Update(ctx, dep); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("シードの部署 看護 と同じ名前に変える: err = %v, want ErrConflict", err)
	}
	if err := r.Update(ctx, organization.Department{ID: "01M3TD000000000000000000J2", Name: "無い"}); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い部署: err = %v, want ErrNotFound", err)
	}
}
