package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
)

const (
	facilityID      = inmem.FacilityID
	otherFacilityID = inmem.OtherFacilityID
	staffID         = inmem.StaffID
	companionID     = inmem.CompanionID
)

func allow(context.Context) error { return nil }

func deny(context.Context) error { return apperr.ErrForbidden }

func newUsecase(s *inmem.Store, guard organization.Guard) *staff.Usecase {
	return staff.NewUsecase(staff.Deps{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
		Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
		Identities: inmem.NewIdentities(),
	}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
}

func TestStaffCreate(t *testing.T) {
	const depID, teamID, posID, otherDepID = "DEP", "TEAM", "POS", "OTHERDEP"
	setup := func() *inmem.Store {
		s := inmem.Seeded()
		s.Departments[depID] = organization.Department{ID: depID, FacilityID: facilityID}
		s.Departments[otherDepID] = organization.Department{ID: otherDepID, FacilityID: otherFacilityID}
		s.Teams[teamID] = organization.Team{ID: teamID, FacilityID: facilityID}
		s.Positions[posID] = organization.Position{ID: posID, FacilityID: facilityID,
			Policies: []organization.Policy{
				{ID: "P1", Code: organization.ScheduleSelfEdit},
				{ID: "P2", Code: organization.ScheduleTeamRead, NeedsTarget: true},
			}}
		return s
	}
	ids := inmem.NewIdentities()
	newUC := func(s *inmem.Store) *staff.Usecase {
		return staff.NewUsecase(staff.Deps{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
			Identities: ids,
		}, &inmem.Tx{}, &inmem.SeqIDs{}, allow)
	}
	in := staff.CreateInput{
		FacilityID: facilityID, Username: "森 健太", Email: "kenta.mori@example.com",
		DepartmentID: depID, TeamID: teamID, PositionID: posID,
	}

	s := setup()
	got, err := newUC(s).Create(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if got.Sub == nil || ids.Members[*got.Sub] != (inmem.Identity{OrgID: inmem.OrgID, Email: "kenta.mori@example.com"}) {
		t.Fatalf("sub = %v, ブローカーの職員 = %+v, want ブローカーが発行した ID", got.Sub, ids.Members)
	}
	g := s.Grants[got.ID]
	if len(g) != 2 || g[0].PolicyID != "P1" || g[1].PolicyID != "P2" {
		t.Fatalf("grants = %+v", g)
	}
	if len(g[0].Targets) != 0 {
		t.Errorf("自分の予定の編集の対象 = %+v, want なし", g[0].Targets)
	}
	if ts := g[1].Targets; len(ts) != 1 || ts[0].TeamID != teamID || ts[0].UserID != "" || ts[0].ID == "" {
		t.Errorf("チームの閲覧の対象 = %+v, want 所属のチーム %s", ts, teamID)
	}

	if _, err := newUC(s).Create(context.Background(), in); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "メール kenta.mori@example.com の職員はこの事業所にすでにいます" {
		t.Errorf("同じメール: err = %v, want メールの重なりの ErrConflict", err)
	}
	if len(ids.Members) != 1 {
		t.Errorf("同じメールの 2 度目の登録の後のブローカーの職員 = %+v, want 最初の登録の 1 人", ids.Members)
	}

	other := in
	other.DepartmentID = otherDepID
	if _, err := newUC(setup()).Create(context.Background(), other); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
}

// TestStaffCreateWithBroker は、ブローカーと予定の API の片方だけが書けたときの戻し方を確認する。
func TestStaffCreateWithBroker(t *testing.T) {
	const depID, teamID, posID = "DEP", "TEAM", "POS"
	setup := func() *inmem.Store {
		s := inmem.Seeded()
		s.Departments[depID] = organization.Department{ID: depID, FacilityID: facilityID}
		s.Teams[teamID] = organization.Team{ID: teamID, FacilityID: facilityID}
		s.Positions[posID] = organization.Position{ID: posID, FacilityID: facilityID}
		return s
	}
	newUC := func(s *inmem.Store, ids *inmem.Identities, guard organization.Guard) *staff.Usecase {
		return staff.NewUsecase(staff.Deps{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
			Identities: ids,
		}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
	}
	in := staff.CreateInput{
		FacilityID: facilityID, Username: "林 さくら", Email: "Sakura.Hayashi@example.com",
		DepartmentID: depID, TeamID: teamID, PositionID: posID,
	}
	ctx := context.Background()

	t.Run("職員の管理の権限が無ければ、ブローカーに職員を作らない", func(t *testing.T) {
		ids := inmem.NewIdentities()
		if _, err := newUC(setup(), ids, deny).Create(ctx, in); !errors.Is(err, apperr.ErrForbidden) {
			t.Fatalf("err = %v, want ErrForbidden", err)
		}
		if len(ids.Members) != 0 {
			t.Errorf("ブローカーの職員 = %+v, want いない", ids.Members)
		}
	})
	t.Run("入力が誤っていれば、ブローカーに職員を作らない", func(t *testing.T) {
		ids := inmem.NewIdentities()
		bad := in
		bad.Email = "not-email"
		if _, err := newUC(setup(), ids, allow).Create(ctx, bad); !errors.Is(err, apperr.ErrInvalidInput) || len(ids.Members) != 0 {
			t.Errorf("err = %v, ブローカーの職員 = %+v, want ErrInvalidInput で作らない", err, ids.Members)
		}
	})
	t.Run("ブローカーで止めた職員と同じメールは 409", func(t *testing.T) {
		ids := inmem.NewIdentities()
		ids.Members["broker-x"] = inmem.Identity{OrgID: inmem.OrgID, Email: "sakura.hayashi@example.com", Suspended: true}
		s := setup()
		_, err := newUC(s, ids, allow).Create(ctx, in)
		if !errors.Is(err, apperr.ErrConflict) || err.Error() != "メール sakura.hayashi@example.com の職員は止められています" {
			t.Errorf("err = %v, want 止めた職員の ErrConflict", err)
		}
	})
	t.Run("ほかの事業所に同じメールの職員がいれば、事業所を示さない 409", func(t *testing.T) {
		ids := inmem.NewIdentities()
		ids.Members["broker-x"] = inmem.Identity{OrgID: "org-other", Email: "sakura.hayashi@example.com"}
		s := setup()
		before := len(s.Staff)
		_, err := newUC(s, ids, allow).Create(ctx, in)
		if !errors.Is(err, apperr.ErrConflict) || err.Error() != "メール sakura.hayashi@example.com の職員は登録できません" {
			t.Errorf("err = %v, want 事業所を示さない ErrConflict", err)
		}
		if len(s.Staff) != before || len(ids.Members) != 1 {
			t.Errorf("職員 = %d 人, ブローカーの職員 = %+v, want 書かない", len(s.Staff), ids.Members)
		}
	})
	t.Run("予定の API に書いてから、ブローカーの職員を有効にする", func(t *testing.T) {
		ids := inmem.NewIdentities()
		got, err := newUC(setup(), ids, allow).Create(ctx, in)
		if err != nil {
			t.Fatal(err)
		}
		if m := ids.Members[*got.Sub]; m.Pending {
			t.Errorf("ブローカーの職員 = %+v, want 有効", m)
		}
	})
	t.Run("有効にできなければエラーを返し、送り直すと書いた職員を有効にして返す", func(t *testing.T) {
		ids := inmem.NewIdentities()
		ids.ActivateErr = errors.New("broker down")
		s := setup()
		before := len(s.Staff)
		if _, err := newUC(s, ids, allow).Create(ctx, in); err == nil {
			t.Fatal("err = nil, want 有効にできないエラー")
		}
		if len(s.Staff) != before+1 || len(ids.Members) != 1 || !ids.Members["broker-1"].Pending {
			t.Fatalf("職員 = %d 人, ブローカーの職員 = %+v, want 書いたが登録の途中のまま", len(s.Staff), ids.Members)
		}
		ids.ActivateErr = nil
		got, err := newUC(s, ids, allow).Create(ctx, in)
		if err != nil || got.Sub == nil || *got.Sub != "broker-1" || ids.Members["broker-1"].Pending || len(s.Staff) != before+1 {
			t.Errorf("送り直し = %+v, %v, ブローカーの職員 = %+v, want 書いた職員を有効にする", got.Sub, err, ids.Members)
		}
	})
	t.Run("ブローカーにだけ残った登録の途中の職員は、送り直すとその ID で書いて有効にする", func(t *testing.T) {
		ids := inmem.NewIdentities()
		ids.Members["broker-x"] = inmem.Identity{OrgID: inmem.OrgID, Email: "sakura.hayashi@example.com", Pending: true}
		got, err := newUC(setup(), ids, allow).Create(ctx, in)
		if err != nil || got.Sub == nil || *got.Sub != "broker-x" || ids.Members["broker-x"].Pending {
			t.Errorf("Create = %+v, %v, ブローカーの職員 = %+v, want 残った職員の ID で有効にする", got.Sub, err, ids.Members)
		}
	})
	t.Run("ブローカーに書けなければ、予定の API に書かない", func(t *testing.T) {
		ids := inmem.NewIdentities()
		ids.Err = errors.New("broker down")
		s := setup()
		before := len(s.Staff)
		if _, err := newUC(s, ids, allow).Create(ctx, in); err == nil || len(s.Staff) != before {
			t.Errorf("err = %v, 職員 = %d 人, want エラーで増えない", err, len(s.Staff))
		}
	})
	t.Run("予定の API に書けなければ、この呼び出しで作ったブローカーの職員を消す", func(t *testing.T) {
		ids := inmem.NewIdentities()
		s := setup()
		// ブローカーにいないメールの職員が予定の API にだけいると、ブローカーの登録は通り、予定の API の書き込みが重なる
		d := s.Staff[staffID]
		d.Email = "sakura.hayashi@example.com"
		s.Staff[staffID] = d
		if _, err := newUC(s, ids, allow).Create(ctx, in); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		if len(ids.Members) != 0 {
			t.Errorf("ブローカーの職員 = %+v, want 消して戻す", ids.Members)
		}
	})
	t.Run("ブローカーに前からいた職員は、予定の API に書けなくても消さない", func(t *testing.T) {
		ids := inmem.NewIdentities()
		s := setup()
		if _, err := newUC(s, ids, allow).Create(ctx, in); err != nil {
			t.Fatal(err)
		}
		if _, err := newUC(s, ids, allow).Create(ctx, in); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("2 度目の err = %v, want ErrConflict", err)
		}
		if len(ids.Members) != 1 {
			t.Errorf("ブローカーの職員 = %+v, want 最初の登録の職員が残る", ids.Members)
		}
	})
	t.Run("事業所が認証の組織に結び付いていなければ 400", func(t *testing.T) {
		ids := inmem.NewIdentities()
		s := setup()
		f := s.Facilities[facilityID]
		f.OrgID = ""
		s.Facilities[facilityID] = f
		if _, err := newUC(s, ids, allow).Create(ctx, in); !errors.Is(err, apperr.ErrInvalidInput) || len(ids.Members) != 0 {
			t.Errorf("err = %v, ブローカーの職員 = %+v, want ErrInvalidInput で作らない", err, ids.Members)
		}
	})
}

func TestStaffSuspend(t *testing.T) {
	ctx := context.Background()
	setup := func() (*inmem.Store, *inmem.Identities) {
		s, ids := inmem.Seeded(), inmem.NewIdentities()
		ids.Members["broker-1"] = inmem.Identity{OrgID: inmem.OrgID, Email: "hina.aoki@example.com"}
		d := s.Staff[staffID]
		sub := "broker-1"
		d.Sub = &sub
		s.Staff[staffID] = d
		return s, ids
	}
	newUC := func(s *inmem.Store, ids *inmem.Identities, guard organization.Guard) *staff.Usecase {
		return staff.NewUsecase(staff.Deps{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
			Identities: ids,
			Self:       func(context.Context) (string, bool) { return companionID, true },
		}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
	}

	s, ids := setup()
	got, err := newUC(s, ids, allow).Suspend(ctx, staffID)
	if err != nil {
		t.Fatal(err)
	}
	if got.SuspendedAt == nil || !ids.Members["broker-1"].Suspended {
		t.Fatalf("SuspendedAt = %v, ブローカー = %+v, want 両方で止める", got.SuspendedAt, ids.Members)
	}
	first := *got.SuspendedAt
	again, err := newUC(s, ids, allow).Suspend(ctx, staffID)
	if err != nil || !again.SuspendedAt.Equal(first) {
		t.Errorf("止め直し = %v, %v, want 最初の時刻 %v のまま成功", again.SuspendedAt, err, first)
	}

	s, ids = setup()
	if _, err := newUC(s, ids, deny).Suspend(ctx, staffID); !errors.Is(err, apperr.ErrForbidden) || ids.Members["broker-1"].Suspended || s.Staff[staffID].SuspendedAt != nil {
		t.Errorf("権限なし: err = %v, want ErrForbidden で止めない", err)
	}
	s, ids = setup()
	ids.Err = errors.New("broker down")
	if _, err := newUC(s, ids, allow).Suspend(ctx, staffID); err == nil || s.Staff[staffID].SuspendedAt != nil {
		t.Errorf("ブローカーで止められない: err = %v, SuspendedAt = %v, want エラーで予定の API にも書かない", err, s.Staff[staffID].SuspendedAt)
	}
	s, ids = setup()
	ids.RevokeErr = errors.New("hydra down")
	if _, err := newUC(s, ids, allow).Suspend(ctx, staffID); err == nil || s.Staff[staffID].SuspendedAt == nil || !ids.Members["broker-1"].Suspended {
		t.Errorf("取り消しに失敗: err = %v, SuspendedAt = %v, want 両方で止めてからエラー", err, s.Staff[staffID].SuspendedAt)
	}
	s, ids = setup()
	delete(ids.Members, "broker-1")
	if got, err := newUC(s, ids, allow).Suspend(ctx, staffID); err != nil || got.SuspendedAt == nil {
		t.Errorf("ブローカーにいない職員: SuspendedAt = %v, err = %v, want 予定の API でだけ止める", got.SuspendedAt, err)
	}
	s, ids = setup()
	if _, err := newUC(s, ids, allow).Suspend(ctx, companionID); !errors.Is(err, apperr.ErrConflict) || s.Staff[companionID].SuspendedAt != nil {
		t.Errorf("自分を止める: err = %v, want ErrConflict で止めない", err)
	}
	if _, err := newUC(inmem.Seeded(), inmem.NewIdentities(), allow).Suspend(ctx, "NONE"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("いない職員: err = %v, want ErrNotFound", err)
	}
}

func TestStaffChangePosition(t *testing.T) {
	const teamID, leaderID, otherPosID = "TEAM", "LEADER", "OTHERPOS"
	setup := func() *inmem.Store {
		s := inmem.Seeded()
		d := s.Staff[staffID]
		d.TeamID = teamID
		d.PositionID = "MEMBER"
		d.Policies = []staff.PolicyGrant{{UserPolicyID: "OLD", PolicyCode: organization.ScheduleUserRead, TargetUserIDs: []string{companionID}}}
		s.Staff[staffID] = d
		s.Positions[leaderID] = organization.Position{ID: leaderID, FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "SELF", Code: organization.ScheduleSelfEdit},
			{ID: "TEAMEDIT", Code: organization.ScheduleTeamEdit, NeedsTarget: true},
		}}
		s.Positions[otherPosID] = organization.Position{ID: otherPosID, FacilityID: otherFacilityID}
		return s
	}
	newUC := func(s *inmem.Store) *staff.Usecase {
		return staff.NewUsecase(staff.Deps{
			Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
			Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
		}, &inmem.Tx{}, &inmem.SeqIDs{}, allow)
	}
	ctx := context.Background()

	s := setup()
	got, err := newUC(s).ChangePosition(ctx, staffID, leaderID)
	if err != nil {
		t.Fatal(err)
	}
	if got.PositionID != leaderID {
		t.Errorf("PositionID = %s", got.PositionID)
	}
	g := s.Grants[staffID]
	if len(g) != 2 || g[0].PolicyID != "SELF" || g[1].PolicyID != "TEAMEDIT" {
		t.Fatalf("grants = %+v, want 新しい役職のデフォルトの権限だけ", g)
	}
	if ts := g[1].Targets; len(ts) != 1 || ts[0].TeamID != teamID {
		t.Errorf("チームの編集の対象 = %+v, want 所属のチーム", ts)
	}

	if _, err := newUC(setup()).ChangePosition(ctx, staffID, otherPosID); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("別の事業所の役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, staffID, "MISSING"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("無い役職: err = %v, want ErrInvalidInput", err)
	}
	if _, err := newUC(setup()).ChangePosition(ctx, "MISSING", leaderID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}

// grantStore は、職員 staffID（チーム TEAM）と、同じ事業所の職員 companionID、チーム TEAM と別の事業所のチーム OTHERTEAM、
// 権限 SELF（対象なし）、USER（職員を対象にする）、TEAM（チームを対象にする）を持つ store を返す。
func grantStore() *inmem.Store {
	s := inmem.Seeded()
	s.Teams["TEAM"] = organization.Team{ID: "TEAM", FacilityID: facilityID}
	s.Teams["OTHERTEAM"] = organization.Team{ID: "OTHERTEAM", FacilityID: otherFacilityID}
	s.Policies["SELF"] = organization.Policy{ID: "SELF", Code: organization.ScheduleSelfEdit, Name: "自分の予定の編集"}
	s.Policies["USER"] = organization.Policy{ID: "USER", Code: organization.ScheduleUserRead, NeedsTarget: true}
	s.Policies["TEAM"] = organization.Policy{ID: "TEAM", Code: organization.ScheduleTeamEdit, NeedsTarget: true}
	return s
}

func TestStaffAddGrant(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name    string
		in      staff.GrantInput
		wantErr error
	}{
		{"対象なしの権限", staff.GrantInput{PolicyID: "SELF"}, nil},
		{"職員を対象にする権限", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{companionID}}, nil},
		{"チームを対象にする権限", staff.GrantInput{PolicyID: "TEAM", TargetTeamIDs: []string{"TEAM"}}, nil},
		{"対象なしの権限に対象", staff.GrantInput{PolicyID: "SELF", TargetUserIDs: []string{companionID}}, apperr.ErrInvalidInput},
		{"職員の権限に対象なし", staff.GrantInput{PolicyID: "USER"}, apperr.ErrInvalidInput},
		{"職員の権限にチーム", staff.GrantInput{PolicyID: "USER", TargetTeamIDs: []string{"TEAM"}}, apperr.ErrInvalidInput},
		{"チームの権限に職員", staff.GrantInput{PolicyID: "TEAM", TargetUserIDs: []string{companionID}}, apperr.ErrInvalidInput},
		{"別の事業所の職員", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{inmem.OtherStaffID}}, apperr.ErrInvalidInput},
		{"別の事業所のチーム", staff.GrantInput{PolicyID: "TEAM", TargetTeamIDs: []string{"OTHERTEAM"}}, apperr.ErrInvalidInput},
		{"重なる対象", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{companionID, companionID}}, apperr.ErrInvalidInput},
		{"無い権限", staff.GrantInput{PolicyID: "MISSING"}, apperr.ErrInvalidInput},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := grantStore()
			_, err := newUsecase(s, allow).AddGrant(ctx, staffID, tt.in)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			g := s.Grants[staffID]
			if len(g) != 1 || g[0].PolicyID != tt.in.PolicyID || len(g[0].Targets) != len(tt.in.TargetUserIDs)+len(tt.in.TargetTeamIDs) {
				t.Errorf("grants = %+v", g)
			}
		})
	}

	s := grantStore()
	uc := newUsecase(s, allow)
	if _, err := uc.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "職員はすでに権限 自分の予定の編集 を持っています" {
		t.Errorf("同じ権限を 2 回: err = %v, want 権限の重なりの ErrConflict", err)
	}
	if _, err := uc.AddGrant(ctx, "MISSING", staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}

func TestStaffRemoveGrant(t *testing.T) {
	ctx := context.Background()
	s := grantStore()
	d := s.Staff[staffID]
	d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP1", PolicyID: "SELF"}}
	s.Staff[staffID] = d
	uc := newUsecase(s, allow)
	if _, err := uc.RemoveGrant(ctx, staffID, "UP1"); err != nil {
		t.Fatal(err)
	}
	if len(s.Staff[staffID].Policies) != 0 {
		t.Errorf("Policies = %+v, want なし", s.Staff[staffID].Policies)
	}
	if _, err := uc.RemoveGrant(ctx, staffID, "UP1"); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("外した権限をもう一度: err = %v, want ErrNotFound", err)
	}
}

// TestStaffManageForbidden は、職員の管理を許されない職員には、職員の登録と、権限と役職を変える操作が apperr.ErrForbidden を返すことを確かめる。
func TestStaffManageForbidden(t *testing.T) {
	ctx := context.Background()
	uc := newUsecase(grantStore(), deny)
	if _, err := uc.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("AddGrant: err = %v", err)
	}
	if _, err := uc.RemoveGrant(ctx, staffID, "UP1"); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("RemoveGrant: err = %v", err)
	}
	if _, err := uc.ChangePosition(ctx, staffID, "POS"); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("ChangePosition: err = %v", err)
	}
	if _, err := uc.Create(ctx, staff.CreateInput{FacilityID: facilityID, Username: "新人", Email: "new@example.com"}); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("Create: err = %v", err)
	}
}
