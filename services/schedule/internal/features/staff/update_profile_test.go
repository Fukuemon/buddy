package staff_test

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestStaffUpdateProfile は、職員の名前、電話番号、部署、チームを変えると、チームの対象が古いチームから新しいチームに移り、
// ほかの事業所の部署とチーム、退職した職員を拒むことを確認する。
func TestStaffUpdateProfile(t *testing.T) {
	const oldTeam, newTeam, otherTeam, depID = "OLDTEAM", "NEWTEAM", "OTHERTEAM", "DEP"
	setup := func() *inmem.Store {
		s := inmem.Seeded()
		s.Departments[depID] = organization.Department{ID: depID, FacilityID: facilityID}
		s.Departments["OTHERDEP"] = organization.Department{ID: "OTHERDEP", FacilityID: otherFacilityID}
		for id, fid := range map[string]string{oldTeam: facilityID, newTeam: facilityID, "THIRD": facilityID, otherTeam: otherFacilityID} {
			s.Teams[id] = organization.Team{ID: id, FacilityID: fid}
		}
		d := s.Staff[staffID]
		d.TeamID = oldTeam
		d.Policies = []staff.PolicyGrant{
			{UserPolicyID: "READ", PolicyCode: organization.ScheduleTeamRead, TargetTeamIDs: []string{oldTeam, "THIRD"}},
			{UserPolicyID: "EDIT", PolicyCode: organization.ScheduleTeamEdit, TargetTeamIDs: []string{oldTeam, newTeam}},
			{UserPolicyID: "USER", PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{companionID}},
		}
		s.Staff[staffID] = d
		return s
	}
	ctx := context.Background()
	phone := "090-1234"
	in := staff.Profile{Username: "青木 ひな", DepartmentID: depID, TeamID: newTeam}

	got, err := newApp(setup(), allow).UpdateProfile(ctx, staffID, in)
	if err != nil {
		t.Fatal(err)
	}
	if got.Username != "青木 ひな" || got.DepartmentID != depID || got.TeamID != newTeam || got.PhoneNumber != nil {
		t.Errorf("職員 = %+v", got.Staff)
	}
	want := map[string][]string{"READ": {"THIRD", newTeam}, "EDIT": {newTeam}, "USER": {}}
	for _, g := range got.Policies {
		if !slices.Equal(g.TargetTeamIDs, want[g.UserPolicyID]) {
			t.Errorf("%s のチームの対象 = %v, want %v", g.UserPolicyID, g.TargetTeamIDs, want[g.UserPolicyID])
		}
	}

	withPhone := in
	withPhone.PhoneNumber = &phone
	if _, err := newApp(setup(), allow).UpdateProfile(ctx, staffID, withPhone); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("数字でない電話番号: err = %v, want ErrInvalidInput", err)
	}
	for name, p := range map[string]staff.Profile{
		"ほかの事業所の部署":  {Username: "青木", DepartmentID: "OTHERDEP", TeamID: newTeam},
		"ほかの事業所のチーム": {Username: "青木", DepartmentID: depID, TeamID: otherTeam},
		"無いチーム":      {Username: "青木", DepartmentID: depID, TeamID: "MISSING"},
		"名前が空":       {DepartmentID: depID, TeamID: newTeam},
	} {
		if _, err := newApp(setup(), allow).UpdateProfile(ctx, staffID, p); !errors.Is(err, apperr.ErrInvalidInput) {
			t.Errorf("%s: err = %v, want ErrInvalidInput", name, err)
		}
	}
	if _, err := newApp(setup(), allow).UpdateProfile(ctx, "MISSING", in); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
	s := setup()
	d := s.Staff[staffID]
	at := time.Now()
	d.RetiredAt = &at
	s.Staff[staffID] = d
	if _, err := newApp(s, allow).UpdateProfile(ctx, staffID, in); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("退職した職員: err = %v, want ErrConflict", err)
	}
	if _, err := newApp(setup(), deny).UpdateProfile(ctx, staffID, in); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("職員の管理の権限が無い: err = %v, want ErrForbidden", err)
	}
}

// 訪問する職員を訪問しない職員に変えるときは、退職と同じ範囲で残る予定と担当の利用者を数え、残れば書かずに一覧を返す。
// 訪問しない職員を訪問する職員に戻すときは確認しない（ADR-0018、#377）。
func TestStaffUpdateProfileNonVisiting(t *testing.T) {
	ctx := context.Background()
	profile := func(s *inmem.Store, nonVisiting bool) staff.Profile {
		s.Departments["DEP"] = organization.Department{ID: "DEP", FacilityID: facilityID}
		s.Teams["TEAM"] = organization.Team{ID: "TEAM", FacilityID: facilityID}
		return staff.Profile{Username: "青木 陽菜", DepartmentID: "DEP", TeamID: "TEAM", NonVisiting: nonVisiting}
	}

	t.Run("残る予定があれば拒む", func(t *testing.T) {
		s, ids := stopFixture()
		_, err := stopApp(s, ids, allow).UpdateProfile(ctx, staffID, profile(s, true))
		ae, ok := errors.AsType[*staff.AssignedError](err)
		if !ok || !ae.NonVisiting || len(ae.Assignments.RecurringSchedules) != 1 || !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want 繰り返しの予定を持つ訪問しない職員への変更の AssignedError", err)
		}
		if s.Staff[staffID].NonVisiting {
			t.Error("拒んだのに訪問しない職員にした")
		}
	})
	t.Run("担当の利用者が残れば拒む", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		p := s.Patients[inmem.PatientID]
		p.AssignedStaffID = staffID
		s.Patients[inmem.PatientID] = p
		_, err := stopApp(s, ids, allow).UpdateProfile(ctx, staffID, profile(s, true))
		if ae, ok := errors.AsType[*staff.AssignedError](err); !ok || len(ae.Assignments.Patients) != 1 {
			t.Fatalf("err = %v, want 担当の利用者を持つ AssignedError", err)
		}
	})
	t.Run("過去の予定だけなら変えられる", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		s.Schedules["PAST"] = scheduleview.Detail{Schedule: schedule.Schedule{ID: "PAST", Slot: schedule.Slot{
			FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 22}}}}
		got, err := stopApp(s, ids, allow).UpdateProfile(ctx, staffID, profile(s, true))
		if err != nil || !got.NonVisiting {
			t.Fatalf("err = %v, 職員 = %+v, want 訪問しない職員", err, got.Staff)
		}
		if s.Schedules["PAST"].StaffID != staffID {
			t.Error("過去の予定の職員を変えた")
		}
	})
	t.Run("訪問する職員には確認なしで戻せる", func(t *testing.T) {
		s, ids := stopFixture()
		d := s.Staff[staffID]
		d.NonVisiting = true
		s.Staff[staffID] = d
		got, err := stopApp(s, ids, allow).UpdateProfile(ctx, staffID, profile(s, false))
		if err != nil || got.NonVisiting {
			t.Fatalf("err = %v, 職員 = %+v, want 残る予定があっても訪問する職員に戻す", err, got.Staff)
		}
	})
	t.Run("訪問しない職員のまま名前を変えるときは数えない", func(t *testing.T) {
		s, ids := stopFixture()
		d := s.Staff[staffID]
		d.NonVisiting = true
		s.Staff[staffID] = d
		p := profile(s, true)
		p.Username = "青木 ひな"
		if _, err := stopApp(s, ids, allow).UpdateProfile(ctx, staffID, p); err != nil {
			t.Fatalf("err = %v, want 成功", err)
		}
	})
}
