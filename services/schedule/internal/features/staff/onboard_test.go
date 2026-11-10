package staff_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// onboardFixture は、事業所 facilityID を SetupFacility が返したことにし、create の呼び出しを数える Onboard を作る。
type onboardFixture struct {
	store *inmem.Store
	// existing は、SetupFacility が事業所を作らず、既にあった事業所を返したことにする。
	existing  bool
	creates   []staff.CreateInput
	createErr error
}

func (f *onboardFixture) onboard() staff.Onboard {
	setup := func(context.Context, organization.SetupFacilityInput) (organization.FacilitySetup, error) {
		return organization.FacilitySetup{
			Facility:        organization.Facility{ID: facilityID},
			FacilityCreated: !f.existing,
			ManagerPosition: organization.Position{ID: "POS-M", Name: "マネージャー", Policies: []organization.Policy{{ID: "P-SM", Code: organization.StaffManage}}},
			Department:      organization.Department{ID: "DEP", Name: "看護部"},
			Team:            organization.Team{ID: "TEAM", Name: "A チーム"},
		}, nil
	}
	create := func(_ context.Context, in staff.CreateInput) (staff.Detail, error) {
		f.creates = append(f.creates, in)
		if f.createErr != nil {
			return staff.Detail{}, f.createErr
		}
		return staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: "NEW", Email: in.Email}}}, nil
	}
	return staff.NewOnboard(setup, create, inmem.Staff{Store: f.store}, inmem.Facilities{Store: f.store}, &inmem.Tx{})
}

// putStaff は、事業所 facilityID に職員 id を入れる。manages が true なら職員の管理の権限を持たせる。
func putStaff(s *inmem.Store, id, email string, manages bool, leave *time.Time) {
	d := staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, FacilityID: facilityID, Email: email, LeaveStartedAt: leave}}}
	if manages {
		d.Policies = []staff.PolicyGrant{{UserPolicyID: "UP-" + id, PolicyCode: organization.StaffManage}}
	}
	s.Staff[id] = d
}

func onboardIn() staff.OnboardInput {
	return staff.OnboardInput{Username: "新井 真央", Email: "Mao.Arai@example.com"}
}

func TestOnboardCreatesManager(t *testing.T) {
	f := &onboardFixture{store: inmem.Seeded()}
	res, err := f.onboard().Do(context.Background(), onboardIn())
	if err != nil {
		t.Fatal(err)
	}
	if !res.ManagerCreated || res.Manager.ID != "NEW" || len(f.creates) != 1 {
		t.Fatalf("res = %+v, creates = %+v", res, f.creates)
	}
	c := f.creates[0]
	if c.Email != "mao.arai@example.com" || c.PositionID != "POS-M" || c.DepartmentID != "DEP" || c.TeamID != "TEAM" || c.NonVisiting {
		t.Errorf("create の入力 = %+v", c)
	}
}

func TestOnboardExistingStaff(t *testing.T) {
	ago := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	tests := []struct {
		name     string
		manages  bool
		leave    *time.Time
		dryRun   bool
		conflict bool
	}{
		{"有効なマネージャーなら、何も書かずに返す", true, nil, false, false},
		{"dry-run でも何も書かずに返す", true, nil, true, false},
		{"職員の管理の権限を持たない有効な職員でも、何も書かずに返す", false, nil, false, false},
		{"休職のマネージャーなら 409", true, &ago, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := &onboardFixture{store: inmem.Seeded(), existing: true}
			putStaff(f.store, "EXIST", "mao.arai@example.com", tt.manages, tt.leave)
			in := onboardIn()
			in.DryRun = tt.dryRun
			res, err := f.onboard().Do(context.Background(), in)
			if tt.conflict {
				if !errors.Is(err, apperr.ErrConflict) {
					t.Errorf("err = %v, want 409", err)
				}
			} else if err != nil || res.ManagerCreated || res.Manager.ID != "EXIST" {
				t.Errorf("res = %+v, err = %v", res, err)
			}
			if len(f.creates) != 0 {
				t.Errorf("create を呼んだ: %+v", f.creates)
			}
		})
	}
}

// 既にある事業所には、有効なマネージャーがいなくても、明示のフラグが無いときは拒み、あれば足す。
func TestOnboardAdditionalManagerFlag(t *testing.T) {
	f := &onboardFixture{store: inmem.Seeded(), existing: true}
	_, err := f.onboard().Do(context.Background(), onboardIn())
	if ce, ok := errors.AsType[*apperr.ConflictError](err); !ok || ce.Code != staff.CodeManagerExists {
		t.Fatalf("err = %v, want %s", err, staff.CodeManagerExists)
	}
	if len(f.creates) != 0 {
		t.Fatalf("create を呼んだ: %+v", f.creates)
	}
	in := onboardIn()
	in.AllowAdditionalManager = true
	if res, err := f.onboard().Do(context.Background(), in); err != nil || !res.ManagerCreated {
		t.Errorf("res = %+v, err = %v", res, err)
	}
}

// dry-run は create を呼ばず、書くはずの職員を、入力を確認してから返す。
func TestOnboardDryRun(t *testing.T) {
	f := &onboardFixture{store: inmem.Seeded()}
	in := onboardIn()
	in.DryRun = true
	res, err := f.onboard().Do(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if !res.ManagerCreated || res.Manager.ID != "" || res.Manager.Username != in.Username || res.Manager.PositionName != "マネージャー" || len(res.Manager.Policies) != 1 {
		t.Errorf("res = %+v", res)
	}
	if len(f.creates) != 0 {
		t.Errorf("create を呼んだ: %+v", f.creates)
	}
	in.Email = "not-an-email"
	if _, err := f.onboard().Do(context.Background(), in); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("err = %v, want 入力のエラー", err)
	}
}

// create の失敗は、全てを戻したことを前に付け、元のエラーの種類を残して返す。
func TestOnboardCreateFailure(t *testing.T) {
	f := &onboardFixture{store: inmem.Seeded(), createErr: apperr.Conflict("メール mao.arai@example.com の職員は登録できません")}
	_, err := f.onboard().Do(context.Background(), onboardIn())
	if !errors.Is(err, apperr.ErrConflict) || !strings.Contains(err.Error(), "全て戻しました") {
		t.Errorf("err = %v", err)
	}
}
