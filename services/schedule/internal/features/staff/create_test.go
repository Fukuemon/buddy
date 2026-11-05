package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

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
	newUC := func(s *inmem.Store) app {
		return build(deps{
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
	newUC := func(s *inmem.Store, ids *inmem.Identities, guard kernel.Guard) app {
		return build(deps{
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
	t.Run("ブローカーで休職の職員と同じメールは 409", func(t *testing.T) {
		ids := inmem.NewIdentities()
		ids.Members["broker-x"] = inmem.Identity{OrgID: inmem.OrgID, Email: "sakura.hayashi@example.com", Suspended: true}
		s := setup()
		_, err := newUC(s, ids, allow).Create(ctx, in)
		if !errors.Is(err, apperr.ErrConflict) || err.Error() != "メール sakura.hayashi@example.com の職員は休職しています" {
			t.Errorf("err = %v, want 休職の職員の ErrConflict", err)
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

// 職員の登録は、訪問しない職員を受け取る。役職からは決めない（ADR-0020）。
func TestStaffCreateNonVisiting(t *testing.T) {
	s := inmem.Seeded()
	s.Departments["DEP"] = organization.Department{ID: "DEP", FacilityID: facilityID}
	s.Teams["TEAM"] = organization.Team{ID: "TEAM", FacilityID: facilityID}
	s.Positions["POS"] = organization.Position{ID: "POS", FacilityID: facilityID}
	got, err := newApp(s, allow).Create(context.Background(), staff.CreateInput{
		FacilityID: facilityID, Username: "事務 太郎", Email: "jimu@example.com",
		DepartmentID: "DEP", TeamID: "TEAM", PositionID: "POS", NonVisiting: true,
	})
	if err != nil || !got.NonVisiting || !s.Staff[got.ID].NonVisiting {
		t.Fatalf("err = %v, 職員 = %+v, want 訪問しない職員", err, got.Staff)
	}
}
