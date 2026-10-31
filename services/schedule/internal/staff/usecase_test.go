package staff_test

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
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

// stopFixture は、休職、復職、退職のテストの事業所である。staffID はブローカーの職員 broker-1 を持ち、
// companionID はリクエストを送る職員で、職員の管理の権限を持つ有効な職員である。
func stopFixture() (*inmem.Store, *inmem.Identities) {
	s, ids := inmem.Seeded(), inmem.NewIdentities()
	ids.Members["broker-1"] = inmem.Identity{OrgID: inmem.OrgID, Email: "hina.aoki@example.com"}
	d := s.Staff[staffID]
	sub := "broker-1"
	d.Sub = &sub
	d.Email = "hina.aoki@example.com"
	d.PhoneNumber = ptr("+09000000000")
	s.Staff[staffID] = d
	c := s.Staff[companionID]
	c.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-C", PolicyCode: organization.StaffManage}}
	s.Staff[companionID] = c
	return s, ids
}

func stopUsecase(s *inmem.Store, ids *inmem.Identities, guard organization.Guard) *staff.Usecase {
	return staff.NewUsecase(staff.Deps{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
		Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
		Identities: ids, Assignments: inmem.StaffAssignments{Store: s}, Calendars: inmem.Calendars{Store: s},
		Self: func(context.Context) (string, bool) { return companionID, true },
		Now:  func() time.Time { return time.Date(2026, 10, 23, 1, 0, 0, 0, time.UTC) },
	}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
}

// betweenTx は、fn をそのまま呼ぶ tx.Transactor で、after 回目のトランザクションを終えた後に run を呼ぶ。
// トランザクションの間に、ほかのリクエストが職員を書いたことを表す。
type betweenTx struct {
	after, calls int
	run          func()
}

func (t *betweenTx) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
	err := fn(ctx)
	t.calls++
	if t.calls == t.after {
		t.run()
	}
	return err
}

// clearAssignments は、seed の繰り返しの予定を外し、staffID に残る予定と担当の利用者を無くす。
func clearAssignments(s *inmem.Store) { delete(s.Recurring, inmem.RecurringID) }

// 職員の管理の権限を持つ職員が職員を休職にしたとき、休職の職員はログインできず、その日以降の予定と担当の利用者の一覧が
// 警告として返る（#268 の検証の観点 1）。
func TestStaffLeave(t *testing.T) {
	ctx := context.Background()
	returnDate := civil.Date{Year: 2027, Month: 4, Day: 1}

	s, ids := stopFixture()
	s.Schedules["PAST"] = schedule.Detail{Schedule: schedule.Schedule{ID: "PAST", Slot: schedule.Slot{
		FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 22}}}}
	s.Schedules["TODAY"] = schedule.Detail{Schedule: schedule.Schedule{ID: "TODAY", Slot: schedule.Slot{
		FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 23}}}}
	p := s.Patients[inmem.PatientID]
	p.AssignedStaffID, p.Name = staffID, "山田 花子"
	s.Patients[inmem.PatientID] = p

	got, err := stopUsecase(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{ReturnDate: &returnDate})
	if err != nil {
		t.Fatal(err)
	}
	if got.Staff.Status() != staff.StatusOnLeave || *got.Staff.LeaveReturnDate != returnDate || !ids.Members["broker-1"].Suspended {
		t.Fatalf("職員 = %+v, ブローカー = %+v, want 両方で休職にし、戻る予定の日を持つ", got.Staff.Staff, ids.Members)
	}
	a := got.Assignments
	if len(a.Schedules) != 1 || a.Schedules[0].ID != "TODAY" || len(a.Recurring) != 1 || a.Recurring[0].ID != inmem.RecurringID ||
		len(a.Patients) != 1 || a.Patients[0].Name != "山田 花子" {
		t.Errorf("残る一覧 = %+v, want 当日の予定（事業所の現地の日付）と繰り返しの予定と担当の利用者", a)
	}

	first := *got.Staff.LeaveStartedAt
	again, err := stopUsecase(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{})
	if err != nil || !again.Staff.LeaveStartedAt.Equal(first) || again.Staff.LeaveReturnDate != nil {
		t.Errorf("休職にし直し = %+v, %v, want 最初の時刻 %v のまま、戻る予定の日だけを消す", again.Staff.Staff, err, first)
	}
}

func TestStaffLeaveRejects(t *testing.T) {
	ctx := context.Background()
	t.Run("職員の管理の権限が無ければ ErrForbidden で書かない", func(t *testing.T) {
		s, ids := stopFixture()
		if _, err := stopUsecase(s, ids, deny).Leave(ctx, staffID, staff.LeaveInput{}); !errors.Is(err, apperr.ErrForbidden) ||
			ids.Members["broker-1"].Suspended || s.Staff[staffID].LeaveStartedAt != nil {
			t.Errorf("err = %v, want ErrForbidden で休職にしない", err)
		}
	})
	t.Run("ブローカーで止められなければ、予定の API にも書かない", func(t *testing.T) {
		s, ids := stopFixture()
		ids.Err = errors.New("broker down")
		if _, err := stopUsecase(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{}); err == nil || s.Staff[staffID].LeaveStartedAt != nil {
			t.Errorf("err = %v, LeaveStartedAt = %v, want エラーで予定の API にも書かない", err, s.Staff[staffID].LeaveStartedAt)
		}
	})
	t.Run("取り消しに失敗すれば、両方で休職にしてからエラー", func(t *testing.T) {
		s, ids := stopFixture()
		ids.RevokeErr = errors.New("hydra down")
		if _, err := stopUsecase(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{}); err == nil ||
			s.Staff[staffID].LeaveStartedAt == nil || !ids.Members["broker-1"].Suspended {
			t.Errorf("err = %v, LeaveStartedAt = %v, want 両方で休職にしてからエラー", err, s.Staff[staffID].LeaveStartedAt)
		}
	})
	t.Run("ブローカーにいない職員は、予定の API でだけ休職にする", func(t *testing.T) {
		s, ids := stopFixture()
		delete(ids.Members, "broker-1")
		if got, err := stopUsecase(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{}); err != nil || got.Staff.Status() != staff.StatusOnLeave {
			t.Errorf("職員 = %+v, err = %v, want 予定の API でだけ休職にする", got.Staff.Staff, err)
		}
	})
	t.Run("退職した職員は ErrConflict", func(t *testing.T) {
		s, ids := stopFixture()
		d := s.Staff[staffID]
		d.RetiredAt = ptr(time.Now())
		s.Staff[staffID] = d
		if _, err := stopUsecase(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{}); !errors.Is(err, apperr.ErrConflict) || ids.Members["broker-1"].Suspended {
			t.Errorf("err = %v, want ErrConflict でブローカーを止めない", err)
		}
	})
	t.Run("いない職員は ErrNotFound", func(t *testing.T) {
		s, ids := stopFixture()
		if _, err := stopUsecase(s, ids, allow).Leave(ctx, "NONE", staff.LeaveInput{}); !errors.Is(err, apperr.ErrNotFound) {
			t.Errorf("err = %v, want ErrNotFound", err)
		}
	})
}

// 自分自身か、職員の管理の権限を持つ最後の有効な職員を休職か退職にしようとしたとき、409 が返る（#268 の検証の観点 6）。
func TestStaffStopRejectsSelfAndLastManager(t *testing.T) {
	ctx := context.Background()
	stops := map[string]func(*staff.Usecase, string) error{
		"休職": func(u *staff.Usecase, id string) error { _, err := u.Leave(ctx, id, staff.LeaveInput{}); return err },
		"退職": func(u *staff.Usecase, id string) error { _, err := u.Retire(ctx, id); return err },
	}
	for name, stop := range stops {
		t.Run(name+"で自分は ErrConflict", func(t *testing.T) {
			s, ids := stopFixture()
			if err := stop(stopUsecase(s, ids, allow), companionID); !errors.Is(err, apperr.ErrConflict) || s.Staff[companionID].Status() != staff.StatusActive {
				t.Errorf("err = %v, want ErrConflict で書かない", err)
			}
		})
		t.Run(name+"で最後の有効な管理者は ErrConflict", func(t *testing.T) {
			s, ids := stopFixture()
			clearAssignments(s)
			d := s.Staff[staffID]
			d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-A", PolicyCode: organization.StaffManage}}
			s.Staff[staffID] = d
			// リクエストを送った管理者が休職になった後に届いた操作を表す。staffID が最後の有効な管理者になる
			c := s.Staff[companionID]
			c.LeaveStartedAt = ptr(time.Now())
			s.Staff[companionID] = c
			if err := stop(stopUsecase(s, ids, allow), staffID); !errors.Is(err, apperr.ErrConflict) ||
				s.Staff[staffID].Status() != staff.StatusActive || ids.Members["broker-1"].Suspended || ids.Members["broker-1"].Retired {
				t.Errorf("err = %v, want ErrConflict で両方に書かない", err)
			}
		})
		t.Run(name+"でほかに有効な管理者がいれば成功", func(t *testing.T) {
			s, ids := stopFixture()
			clearAssignments(s)
			d := s.Staff[staffID]
			d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-A", PolicyCode: organization.StaffManage}}
			s.Staff[staffID] = d
			if err := stop(stopUsecase(s, ids, allow), staffID); err != nil {
				t.Errorf("err = %v, want 成功", err)
			}
		})
	}
}

func TestStaffReinstate(t *testing.T) {
	ctx := context.Background()
	onLeave := func() (*inmem.Store, *inmem.Identities) {
		s, ids := stopFixture()
		if _, err := stopUsecase(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{ReturnDate: &civil.Date{Year: 2027, Month: 4, Day: 1}}); err != nil {
			t.Fatal(err)
		}
		return s, ids
	}

	// 休職の職員を復職にしたとき、同じ上流のアカウントでログインできる（#268 の検証の観点 2）。ブローカーの職員の ID は変わらない
	s, ids := onLeave()
	got, err := stopUsecase(s, ids, allow).Reinstate(ctx, staffID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status() != staff.StatusActive || got.LeaveReturnDate != nil || ids.Members["broker-1"].Suspended || *got.Sub != "broker-1" {
		t.Fatalf("職員 = %+v, ブローカー = %+v, want 両方で有効に戻し、同じブローカーの職員", got.Staff, ids.Members)
	}
	if _, err := stopUsecase(s, ids, allow).Reinstate(ctx, staffID); err != nil {
		t.Errorf("有効な職員の復職の err = %v, want 成功", err)
	}

	t.Run("職員の管理の権限が無ければ ErrForbidden", func(t *testing.T) {
		s, ids := onLeave()
		if _, err := stopUsecase(s, ids, deny).Reinstate(ctx, staffID); !errors.Is(err, apperr.ErrForbidden) || s.Staff[staffID].Status() != staff.StatusOnLeave {
			t.Errorf("err = %v, want ErrForbidden で戻さない", err)
		}
	})
	t.Run("ブローカーに届かなければ、休職を外してからエラーで、送り直すと戻す", func(t *testing.T) {
		s, ids := onLeave()
		ids.ResumeErr = errors.New("broker down")
		if _, err := stopUsecase(s, ids, allow).Reinstate(ctx, staffID); err == nil || s.Staff[staffID].Status() != staff.StatusActive || !ids.Members["broker-1"].Suspended {
			t.Fatalf("err = %v, want 予定の API で休職を外し、ブローカーは止めたままエラー", err)
		}
		ids.ResumeErr = nil
		if _, err := stopUsecase(s, ids, allow).Reinstate(ctx, staffID); err != nil || ids.Members["broker-1"].Suspended {
			t.Errorf("送り直し: err = %v, want ブローカーの職員も戻す", err)
		}
	})
	t.Run("ブローカーで退職していれば ErrConflict", func(t *testing.T) {
		s, ids := onLeave()
		m := ids.Members["broker-1"]
		m.Retired = true
		ids.Members["broker-1"] = m
		if _, err := stopUsecase(s, ids, allow).Reinstate(ctx, staffID); !errors.Is(err, apperr.ErrConflict) {
			t.Errorf("err = %v, want ErrConflict", err)
		}
		if d := s.Staff[staffID]; d.Status() != staff.StatusOnLeave || d.LeaveReturnDate == nil || *d.LeaveReturnDate != (civil.Date{Year: 2027, Month: 4, Day: 1}) {
			t.Errorf("職員 = %+v, want 外した休職を戻る予定の日ごと書き戻す", d.Staff)
		}
	})
	t.Run("休職を外した後に休職にし直されていれば、ブローカーの職員を戻さない", func(t *testing.T) {
		s, ids := onLeave()
		u := staff.NewUsecase(staff.Deps{
			Facilities: inmem.Facilities{Store: s}, Staff: inmem.Staff{Store: s}, Identities: ids,
			Assignments: inmem.StaffAssignments{Store: s},
		}, &betweenTx{after: 1, run: func() {
			d := s.Staff[staffID]
			d.LeaveStartedAt = ptr(time.Now())
			s.Staff[staffID] = d
		}}, &inmem.SeqIDs{}, allow)
		if _, err := u.Reinstate(ctx, staffID); !errors.Is(err, apperr.ErrConflict) || !ids.Members["broker-1"].Suspended {
			t.Errorf("err = %v, ブローカー = %+v, want ErrConflict でブローカーは止めたまま", err, ids.Members)
		}
	})
	t.Run("退職した職員は ErrConflict", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		if _, err := stopUsecase(s, ids, allow).Retire(ctx, staffID); err != nil {
			t.Fatal(err)
		}
		if _, err := stopUsecase(s, ids, allow).Reinstate(ctx, staffID); !errors.Is(err, apperr.ErrConflict) || s.Staff[staffID].Status() != staff.StatusRetired {
			t.Errorf("err = %v, want ErrConflict で退職のまま", err)
		}
	})
}

// 予定と担当が残らない職員を退職にしたとき、ログインできず、電話番号が消え、名前は残る（#268 の検証の観点 4）。
func TestStaffRetire(t *testing.T) {
	ctx := context.Background()
	s, ids := stopFixture()
	clearAssignments(s)
	d := s.Staff[staffID]
	d.Username = "青木 陽菜"
	d.LeaveStartedAt = ptr(time.Now())
	s.Staff[staffID] = d
	s.Schedules["PAST"] = schedule.Detail{Schedule: schedule.Schedule{ID: "PAST", Slot: schedule.Slot{
		FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 22}}}}
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: "staff@example.com"}
	s.Links["LINK"] = calendar.Link{ID: "LINK", FacilityID: facilityID, ExternalCalendarID: "CAL", ExternalEventID: "EV", ScheduleID: ptr("PAST")}

	got, err := stopUsecase(s, ids, allow).Retire(ctx, staffID)
	if err != nil {
		t.Fatal(err)
	}
	// 退職は職員のカレンダーを外し、カレンダーのレコードと予定の対応は残す（#278 の検証の観点 1）
	if c, ok := s.Calendars["CAL"]; !ok || c.DisabledAt == nil {
		t.Errorf("カレンダー = %+v, want 退職で外す", c)
	}
	if _, ok := s.Links["LINK"]; !ok {
		t.Error("予定の対応が消えた, want 退職で外しても残す")
	}
	st := got.Staff
	if st.Status() != staff.StatusRetired || st.Username != "青木 陽菜" || st.Email != "" || st.PhoneNumber != nil || st.LeaveStartedAt != nil {
		t.Fatalf("職員 = %+v, want 退職で名前を残し、メールと電話番号と休職を消す", st.Staff)
	}
	if m := ids.Members["broker-1"]; !m.Retired || m.Email != "" {
		t.Errorf("ブローカー = %+v, want 退職でメールを消す", m)
	}
	if !got.Assignments.Empty() {
		t.Errorf("残る一覧 = %+v, want 空（過去の予定は数えない）", got.Assignments)
	}
	first := *st.RetiredAt
	again, err := stopUsecase(s, ids, allow).Retire(ctx, staffID)
	if err != nil || !again.Staff.RetiredAt.Equal(first) {
		t.Errorf("退職にし直し = %v, %v, want 最初の時刻 %v のまま成功", again.Staff.RetiredAt, err, first)
	}

	t.Run("取り消しに失敗すれば、両方で退職にしてからエラー", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		ids.RevokeErr = errors.New("hydra down")
		if _, err := stopUsecase(s, ids, allow).Retire(ctx, staffID); err == nil || s.Staff[staffID].Status() != staff.StatusRetired || !ids.Members["broker-1"].Retired {
			t.Errorf("err = %v, want 両方で退職にしてからエラー", err)
		}
	})
	t.Run("ブローカーにいない職員は、予定の API でだけ退職にする", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		delete(ids.Members, "broker-1")
		if got, err := stopUsecase(s, ids, allow).Retire(ctx, staffID); err != nil || got.Staff.Status() != staff.StatusRetired {
			t.Errorf("err = %v, want 予定の API でだけ退職にする", err)
		}
	})
}

// その日以降の予定か担当の利用者が残る職員を退職にしようとしたとき、409 で残る一覧が返る（#268 の検証の観点 3）。
func TestStaffRetireRejectsAssignments(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name string
		edit func(*inmem.Store)
	}{
		{"繰り返しの予定", func(*inmem.Store) {}},
		{"その日の予定", func(s *inmem.Store) {
			clearAssignments(s)
			s.Schedules["TODAY"] = schedule.Detail{Schedule: schedule.Schedule{ID: "TODAY", Slot: schedule.Slot{
				FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 23}}}}
		}},
		{"同行者の予定", func(s *inmem.Store) {
			clearAssignments(s)
			s.Infos["INFO"] = visit.Info{ID: "INFO", AssignedStaffID: companionID, CompanionID: ptr(staffID)}
			s.Schedules["VISIT"] = schedule.Detail{Schedule: schedule.Schedule{ID: "VISIT", Slot: schedule.Slot{
				FacilityID: facilityID, StaffID: companionID, Date: civil.Date{Year: 2026, Month: 11, Day: 1}, VisitInfoID: ptr("INFO")}}}
		}},
		{"担当の利用者", func(s *inmem.Store) {
			clearAssignments(s)
			p := s.Patients[inmem.PatientID]
			p.AssignedStaffID = staffID
			s.Patients[inmem.PatientID] = p
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, ids := stopFixture()
			tt.edit(s)
			s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID}
			_, err := stopUsecase(s, ids, allow).Retire(ctx, staffID)
			if s.Calendars["CAL"].DisabledAt != nil {
				t.Error("退職を拒んだのにカレンダーを外した")
			}
			ae, ok := errors.AsType[*staff.AssignedError](err)
			if !ok || ae.Assignments.Empty() || !errors.Is(err, apperr.ErrConflict) {
				t.Fatalf("err = %v, want 残る一覧を持つ AssignedError", err)
			}
			if s.Staff[staffID].Status() != staff.StatusActive || ids.Members["broker-1"].Retired || s.Staff[staffID].Email == "" {
				t.Errorf("職員 = %+v, want 両方に書かない", s.Staff[staffID].Staff)
			}
		})
	}
	t.Run("キャンセルした予定は数えない", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		s.Schedules["CANCELLED"] = schedule.Detail{Schedule: schedule.Schedule{ID: "CANCELLED", Slot: schedule.Slot{
			FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 11, Day: 1}}}}
		s.Cancels["CANCELLED"] = schedule.Cancel{ScheduleID: "CANCELLED"}
		if _, err := stopUsecase(s, ids, allow).Retire(ctx, staffID); err != nil {
			t.Errorf("err = %v, want 成功", err)
		}
	})
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

	got, err := newUsecase(setup(), allow).UpdateProfile(ctx, staffID, in)
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
	if _, err := newUsecase(setup(), allow).UpdateProfile(ctx, staffID, withPhone); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("数字でない電話番号: err = %v, want ErrInvalidInput", err)
	}
	for name, p := range map[string]staff.Profile{
		"ほかの事業所の部署":  {Username: "青木", DepartmentID: "OTHERDEP", TeamID: newTeam},
		"ほかの事業所のチーム": {Username: "青木", DepartmentID: depID, TeamID: otherTeam},
		"無いチーム":      {Username: "青木", DepartmentID: depID, TeamID: "MISSING"},
		"名前が空":       {DepartmentID: depID, TeamID: newTeam},
	} {
		if _, err := newUsecase(setup(), allow).UpdateProfile(ctx, staffID, p); !errors.Is(err, apperr.ErrInvalidInput) {
			t.Errorf("%s: err = %v, want ErrInvalidInput", name, err)
		}
	}
	if _, err := newUsecase(setup(), allow).UpdateProfile(ctx, "MISSING", in); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
	s := setup()
	d := s.Staff[staffID]
	at := time.Now()
	d.RetiredAt = &at
	s.Staff[staffID] = d
	if _, err := newUsecase(s, allow).UpdateProfile(ctx, staffID, in); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("退職した職員: err = %v, want ErrConflict", err)
	}
	if _, err := newUsecase(setup(), deny).UpdateProfile(ctx, staffID, in); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("職員の管理の権限が無い: err = %v, want ErrForbidden", err)
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

// 職員の管理の権限を持つ最後の有効な職員から、権限を外す操作と役職を変える操作でその権限を外そうとしたとき、409 が返り、
// 何も変わらない（#279 の検証の観点 1、2）。ほかに有効な管理者がいれば外せる（観点 3）。
func TestStaffKeepsLastManager(t *testing.T) {
	ctx := context.Background()
	const leaderID, managerPosID = "LEADER", "MANAGER"
	// fixture は、companionID だけが職員の管理の権限を持つ有効な職員の事業所である。withOther なら staffID も権限を持つ。
	fixture := func(withOther bool) *inmem.Store {
		s, _ := stopFixture()
		c := s.Staff[companionID]
		c.PositionID = managerPosID
		s.Staff[companionID] = c
		if withOther {
			d := s.Staff[staffID]
			d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-A", PolicyCode: organization.StaffManage}}
			s.Staff[staffID] = d
		}
		s.Positions[leaderID] = organization.Position{ID: leaderID, FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "SELF", Code: organization.ScheduleSelfEdit},
		}}
		s.Positions[managerPosID] = organization.Position{ID: managerPosID, FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "MANAGE", Code: organization.StaffManage},
		}}
		return s
	}
	uc := func(s *inmem.Store) *staff.Usecase { return stopUsecase(s, inmem.NewIdentities(), allow) }
	managers := func(t *testing.T, s *inmem.Store) []string {
		t.Helper()
		m, err := inmem.Staff{Store: s}.ActiveManagers(ctx, facilityID)
		if err != nil {
			t.Fatal(err)
		}
		return m
	}

	t.Run("最後の有効な管理者から職員の管理の権限を外すと 409 で権限が残る", func(t *testing.T) {
		s := fixture(false)
		if _, err := uc(s).RemoveGrant(ctx, companionID, "UP-C"); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		if got := managers(t, s); len(got) != 1 || got[0] != companionID {
			t.Errorf("有効な管理者 = %v, want 権限が残る", got)
		}
	})
	t.Run("最後の有効な管理者の役職を職員の管理の権限の無い役職に変えると 409 で役職と権限が変わらない", func(t *testing.T) {
		s := fixture(false)
		if _, err := uc(s).ChangePosition(ctx, companionID, leaderID); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		if got := s.Staff[companionID]; got.PositionID != managerPosID || len(got.Policies) != 1 || got.Policies[0].UserPolicyID != "UP-C" {
			t.Errorf("職員 = %+v, want 役職と権限が変わらない", got)
		}
	})
	t.Run("休職の管理者しかほかにいなければ 409", func(t *testing.T) {
		s := fixture(true)
		d := s.Staff[staffID]
		d.LeaveStartedAt = ptr(time.Now())
		s.Staff[staffID] = d
		if _, err := uc(s).RemoveGrant(ctx, companionID, "UP-C"); !errors.Is(err, apperr.ErrConflict) {
			t.Errorf("err = %v, want ErrConflict", err)
		}
	})
	t.Run("最後の有効な管理者の役職を職員の管理の権限を持つ役職に変えられる", func(t *testing.T) {
		s := fixture(false)
		s.Positions["MANAGER2"] = organization.Position{ID: "MANAGER2", FacilityID: facilityID, Policies: []organization.Policy{
			{ID: "MANAGE", Code: organization.StaffManage}, {ID: "SELF", Code: organization.ScheduleSelfEdit},
		}}
		if _, err := uc(s).ChangePosition(ctx, companionID, "MANAGER2"); err != nil {
			t.Errorf("err = %v, want 成功", err)
		}
	})
	t.Run("最後の有効な管理者からほかの権限は外せる", func(t *testing.T) {
		s := fixture(false)
		c := s.Staff[companionID]
		c.Policies = append(c.Policies, staff.PolicyGrant{UserPolicyID: "UP-SELF", PolicyCode: organization.ScheduleSelfEdit})
		s.Staff[companionID] = c
		if _, err := uc(s).RemoveGrant(ctx, companionID, "UP-SELF"); err != nil {
			t.Errorf("err = %v, want 成功", err)
		}
	})
	t.Run("ほかに有効な管理者がいれば職員の管理の権限を外せる", func(t *testing.T) {
		s := fixture(true)
		if _, err := uc(s).RemoveGrant(ctx, companionID, "UP-C"); err != nil {
			t.Fatalf("err = %v, want 成功", err)
		}
		if got := managers(t, s); len(got) != 1 || got[0] != staffID {
			t.Errorf("有効な管理者 = %v, want もう 1 人が残る", got)
		}
	})
	t.Run("ほかに有効な管理者がいれば職員の管理の権限の無い役職に変えられる", func(t *testing.T) {
		s := fixture(true)
		if _, err := uc(s).ChangePosition(ctx, companionID, leaderID); err != nil {
			t.Errorf("err = %v, want 成功", err)
		}
	})
}

// TestStaffManageForbidden は、職員の管理を許されない職員には、職員の登録と、権限と役職を変える操作が apperr.ErrForbidden を返すことを確認する。
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
