package staff_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

const (
	facilityID      = inmem.FacilityID
	otherFacilityID = inmem.OtherFacilityID
	staffID         = inmem.StaffID
	companionID     = inmem.CompanionID
)

func allow(context.Context) error { return nil }

func deny(context.Context) error { return apperr.ErrForbidden }

func newApp(s *inmem.Store, guard kernel.Guard) app {
	return build(deps{
		Facilities: inmem.Facilities{Store: s}, Departments: inmem.Departments{Store: s}, Teams: inmem.Teams{Store: s},
		Positions: inmem.Positions{Store: s}, Policies: inmem.Policies{Store: s}, Staff: inmem.Staff{Store: s},
		Identities: inmem.NewIdentities(),
	}, &inmem.Tx{}, &inmem.SeqIDs{}, guard)
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
	c.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-C", PolicyID: "MANAGE", PolicyCode: organization.StaffManage}}
	s.Staff[companionID] = c
	return s, ids
}

func stopApp(s *inmem.Store, ids *inmem.Identities, guard kernel.Guard) app {
	return build(deps{
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

// 自分自身か、職員の管理の権限を持つ最後の有効な職員を休職か退職にしようとしたとき、409 が返る（#268 の検証の観点 6）。
func TestStaffStopRejectsSelfAndLastManager(t *testing.T) {
	ctx := context.Background()
	stops := map[string]func(app, string) error{
		"休職": func(u app, id string) error { _, err := u.Leave(ctx, id, staff.LeaveInput{}); return err },
		"退職": func(u app, id string) error { _, err := u.Retire(ctx, id); return err },
	}
	for name, stop := range stops {
		t.Run(name+"で自分は ErrConflict", func(t *testing.T) {
			s, ids := stopFixture()
			if err := stop(stopApp(s, ids, allow), companionID); !errors.Is(err, apperr.ErrConflict) || s.Staff[companionID].Status() != staff.StatusActive {
				t.Errorf("err = %v, want ErrConflict で書かない", err)
			}
		})
		t.Run(name+"で最後の有効な管理者は ErrConflict", func(t *testing.T) {
			s, ids := stopFixture()
			clearAssignments(s)
			d := s.Staff[staffID]
			d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-A", PolicyID: "MANAGE", PolicyCode: organization.StaffManage}}
			s.Staff[staffID] = d
			// リクエストを送った管理者が休職になった後に届いた操作を表す。staffID が最後の有効な管理者になる
			c := s.Staff[companionID]
			c.LeaveStartedAt = ptr(time.Now())
			s.Staff[companionID] = c
			if err := stop(stopApp(s, ids, allow), staffID); !errors.Is(err, apperr.ErrConflict) ||
				s.Staff[staffID].Status() != staff.StatusActive || ids.Members["broker-1"].Suspended || ids.Members["broker-1"].Retired {
				t.Errorf("err = %v, want ErrConflict で両方に書かない", err)
			}
		})
		t.Run(name+"でほかに有効な管理者がいれば成功", func(t *testing.T) {
			s, ids := stopFixture()
			clearAssignments(s)
			d := s.Staff[staffID]
			d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-A", PolicyID: "MANAGE", PolicyCode: organization.StaffManage}}
			s.Staff[staffID] = d
			if err := stop(stopApp(s, ids, allow), staffID); err != nil {
				t.Errorf("err = %v, want 成功", err)
			}
		})
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
			d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-A", PolicyID: "MANAGE", PolicyCode: organization.StaffManage}}
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
	uc := func(s *inmem.Store) app { return stopApp(s, inmem.NewIdentities(), allow) }
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
	t.Run("役職のデフォルトの職員の管理の権限しか持たない最後の有効な管理者の役職を、その権限の無い役職に変えると 409 で役職と権限が変わらない", func(t *testing.T) {
		s := fixture(false)
		if _, err := uc(s).ChangePosition(ctx, companionID, leaderID); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		if got := s.Staff[companionID]; got.PositionID != managerPosID || len(got.Policies) != 1 || got.Policies[0].UserPolicyID != "UP-C" {
			t.Errorf("職員 = %+v, want 役職と権限が変わらない", got)
		}
	})
	t.Run("職員ごとに職員の管理の権限を足した最後の有効な管理者は、その権限を持たない役職に変えられ、権限が残る", func(t *testing.T) {
		s := fixture(false)
		c := s.Staff[companionID]
		c.PositionID = leaderID
		c.Policies = []staff.PolicyGrant{
			{UserPolicyID: "UP-SELF", PolicyID: "SELF", PolicyCode: organization.ScheduleSelfEdit},
			{UserPolicyID: "UP-C", PolicyID: "MANAGE", PolicyCode: organization.StaffManage},
		}
		s.Staff[companionID] = c
		s.Positions["MEMBER"] = organization.Position{ID: "MEMBER", FacilityID: facilityID}
		if _, err := uc(s).ChangePosition(ctx, companionID, "MEMBER"); err != nil {
			t.Fatalf("err = %v, want 成功", err)
		}
		if got := managers(t, s); len(got) != 1 || got[0] != companionID {
			t.Errorf("有効な管理者 = %v, want 職員ごとに足した権限が残る", got)
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
	uc := newApp(grantStore(), deny)
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

// deps は、テストが staff の操作の型に渡す依存である。テストが使わない依存は nil のままにする。
type deps struct {
	Facilities interface {
		kernel.Finder[organization.Facility]
		staff.FacilityLock
	}
	Departments kernel.Finder[organization.Department]
	Teams       kernel.Finder[organization.Team]
	Positions   kernel.Finder[organization.Position]
	Policies    kernel.Finder[organization.Policy]
	Staff       staff.Repository
	Identities  staff.Identities
	Assignments staff.AssignmentReader
	Calendars   staff.CalendarDetacher
	Self        func(ctx context.Context) (string, bool)
	Now         func() time.Time
	// Audits は、監査の記録を書く先である。nil なら、どこからも読まないメモリ上の記録に書く。
	Audits audit.Writer
}

// app は、テストが呼ぶ staff の操作の Do である。
type app struct {
	Create               func(ctx context.Context, in staff.CreateInput) (staff.Detail, error)
	Get                  func(ctx context.Context, id string) (staff.Detail, error)
	List                 func(ctx context.Context, facilityID string, q staff.ListQuery) ([]staff.Summary, error)
	ChangePosition       func(ctx context.Context, id, positionID string) (staff.Detail, error)
	UpdateProfile        func(ctx context.Context, id string, p staff.Profile) (staff.Detail, error)
	AddGrant             func(ctx context.Context, id string, in staff.GrantInput) (staff.Detail, error)
	RemoveGrant          func(ctx context.Context, id, userPolicyID string) (staff.Detail, error)
	Leave                func(ctx context.Context, id string, in staff.LeaveInput) (staff.StatusChange, error)
	Reinstate            func(ctx context.Context, id string) (staff.Detail, error)
	Retire               func(ctx context.Context, id string) (staff.StatusChange, error)
	RemainingAssignments func(ctx context.Context, id string) (staff.Assignments, error)
}

// build は、d の依存で staff の全ての操作の型を作る。d.Self が nil なら、リクエストを送った職員を companionID にする。
// 監査の記録を書く操作は、ctx に相関 ID testRequestID を入れてから呼ぶ。
func build(d deps, tx tx.Transactor, ids kernel.IDGenerator, guard kernel.Guard) app {
	self := d.Self
	if self == nil {
		self = func(context.Context) (string, bool) { return companionID, true }
	}
	audits := d.Audits
	if audits == nil {
		audits = inmem.PermissionAudits{Store: inmem.NewStore()}
	}
	rec := audit.NewRecorder(audits, ids, self)
	create := staff.NewCreate(d.Facilities, d.Departments, d.Teams, d.Positions, d.Identities, d.Staff, rec, tx, ids, guard)
	changePosition := staff.NewChangePosition(d.Staff, d.Facilities, d.Positions, rec, tx, ids, guard)
	updateProfile := staff.NewUpdateProfile(d.Staff, d.Facilities, d.Departments, d.Teams, d.Assignments, d.Now, rec, tx, guard)
	addGrant := staff.NewAddGrant(d.Staff, d.Facilities, d.Policies, d.Teams, rec, tx, ids, guard)
	removeGrant := staff.NewRemoveGrant(d.Staff, d.Facilities, rec, tx, guard)
	return app{
		Create: func(ctx context.Context, in staff.CreateInput) (staff.Detail, error) {
			return create.Do(withRequestID(ctx), in)
		},
		Get:  staff.NewGet(d.Staff).Do,
		List: staff.NewList(d.Facilities, d.Staff).Do,
		ChangePosition: func(ctx context.Context, id, positionID string) (staff.Detail, error) {
			return changePosition.Do(withRequestID(ctx), id, positionID)
		},
		UpdateProfile: func(ctx context.Context, id string, p staff.Profile) (staff.Detail, error) {
			return updateProfile.Do(withRequestID(ctx), id, p)
		},
		AddGrant: func(ctx context.Context, id string, in staff.GrantInput) (staff.Detail, error) {
			return addGrant.Do(withRequestID(ctx), id, in)
		},
		RemoveGrant: func(ctx context.Context, id, userPolicyID string) (staff.Detail, error) {
			return removeGrant.Do(withRequestID(ctx), id, userPolicyID)
		},
		Leave:                staff.NewLeave(d.Self, d.Staff, d.Facilities, d.Assignments, d.Now, d.Identities, tx, guard).Do,
		Reinstate:            staff.NewReinstate(d.Staff, d.Facilities, d.Identities, tx, guard).Do,
		Retire:               staff.NewRetire(d.Self, d.Staff, d.Facilities, d.Assignments, d.Now, d.Identities, d.Calendars, tx, guard).Do,
		RemainingAssignments: staff.NewRemainingAssignments(d.Staff, d.Assignments, d.Now, guard).Do,
	}
}

// testRequestID は、テストの操作が ctx に入れる相関 ID である。
const testRequestID = "REQUEST-1"

// withRequestID は、相関 ID testRequestID を持つ ctx を返す。予定の API ではミドルウェアが振る。
func withRequestID(ctx context.Context) context.Context {
	return audit.WithRequestID(ctx, testRequestID)
}
