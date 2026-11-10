package postgres

import (
	"context"
	"errors"
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// onboardDB は、マイグレーションだけを適用した空のデータベースの接続のプールを返す。
// 事業所の登録は、本物のトランザクションでコミットとロールバックを確認するので、ほかのテストと DB を分ける。
func onboardDB(t *testing.T, name string) *pgxpool.Pool {
	t.Helper()
	cfg := newDatabase(t, name)
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	pool, err := Open(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// onboardWith は、cmd/ops と同じ組み立てで、ブローカーを ids に置き換えた staff.Onboard の Do を返す。
func onboardWith(pool *pgxpool.Pool, ids *inmem.Identities) func(context.Context, staff.OnboardInput) (staff.OnboardResult, error) {
	tx, gen := NewTransactor(pool), ulid.Generator{}
	facilities, departments, teams := NewFacilityRepository(pool), NewDepartmentRepository(pool), NewTeamRepository(pool)
	positions, policies, staffRepo := NewPositionRepository(pool), NewPolicyRepository(pool), NewStaffRepository(pool)
	setup := organization.NewSetupFacility(facilities, facilities, departments, teams, positions, policies, gen)
	create := staff.NewCreate(facilities, departments, teams, positions, ids, staffRepo, tx, gen, func(context.Context) error { return nil })
	return staff.NewOnboard(setup.Do, create.Do, staffRepo, facilities, tx).Do
}

func onboardInput() staff.OnboardInput {
	return staff.OnboardInput{
		Facility: organization.SetupFacilityInput{OrgID: "org-new", Name: "新しい事業所", DepartmentName: "看護部", TeamName: "A チーム"},
		Username: "新井 真央",
		Email:    "Mao.Arai@example.com",
	}
}

// onboardRows は、事業所、役職、部署、チーム、職員、職員の権限の行の数を返す。
func onboardRows(t *testing.T, pool *pgxpool.Pool) map[string]int {
	t.Helper()
	out := map[string]int{}
	for _, table := range []string{"facilities", "positions", "position_policies", "departments", "teams", "users", "user_policies"} {
		var n int
		if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table).Scan(&n); err != nil {
			t.Fatal(err)
		}
		out[table] = n
	}
	return out
}

func noRows(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	for table, n := range onboardRows(t, pool) {
		if n != 0 {
			t.Errorf("%s に %d 行が残った", table, n)
		}
	}
}

// 事業所が無い状態から 1 回流すと、事業所、標準の 4 つの役職、部署、チーム、マネージャーが登録され、ブローカーの職員が有効になる。
// 同じ引数で流し直しても、何も増えない。
func TestOnboardCreatesFacilityAndManager(t *testing.T) {
	pool := onboardDB(t, "onboard_create")
	ids := inmem.NewIdentities()
	onboard := onboardWith(pool, ids)
	ctx := context.Background()

	res, err := onboard(ctx, onboardInput())
	if err != nil {
		t.Fatal(err)
	}
	if !res.Setup.FacilityCreated || !res.ManagerCreated || !res.Setup.DepartmentCreated || !res.Setup.TeamCreated {
		t.Errorf("作ったもの = %+v", res)
	}
	if want := []string{"マネージャー", "チームリーダー", "メンバー", "事務"}; !slices.Equal(res.Setup.CreatedPositions, want) {
		t.Errorf("役職 = %v, want %v", res.Setup.CreatedPositions, want)
	}
	if res.Setup.Facility.SourceMode != organization.SourceGooglePrimary {
		t.Errorf("正本のモード = %s, want google_primary", res.Setup.Facility.SourceMode)
	}
	m := res.Manager
	if m.Email != "mao.arai@example.com" || m.PositionName != "マネージャー" || m.Sub == nil {
		t.Errorf("マネージャー = %+v", m.Summary)
	}
	var codes []organization.PolicyCode
	for _, g := range m.Policies {
		codes = append(codes, g.PolicyCode)
	}
	for _, want := range organization.StandardPositions()[0].Policies {
		if !slices.Contains(codes, want) {
			t.Errorf("マネージャーの権限 %v に %s が無い", codes, want)
		}
	}
	if id := ids.Members[*m.Sub]; id.Pending || id.OrgID != "org-new" {
		t.Errorf("ブローカーの職員 = %+v, want 有効", id)
	}
	// 役職ごとのデフォルトの権限の数は、PRD の表のとおり 5、3、1、3 である
	want := map[string]int{"facilities": 1, "positions": 4, "position_policies": 12, "departments": 1, "teams": 1, "users": 1, "user_policies": 5}
	if got := onboardRows(t, pool); !maps.Equal(got, want) {
		t.Errorf("行の数 = %v, want %v", got, want)
	}

	again, err := onboard(ctx, onboardInput())
	if err != nil {
		t.Fatal(err)
	}
	if again.Setup.FacilityCreated || again.ManagerCreated || again.Manager.ID != m.ID || len(again.Setup.CreatedPositions) != 0 {
		t.Errorf("流し直しの結果 = %+v", again)
	}
	if got := onboardRows(t, pool); !maps.Equal(got, want) {
		t.Errorf("流し直しの後の行の数 = %v, want %v", got, want)
	}
	if len(ids.Members) != 1 {
		t.Errorf("ブローカーの職員 = %v, want 1 人", ids.Members)
	}

	// 部署とチームの名前が違っても、同じメールの有効な職員がいれば、部署とチームを作らずに成功する
	renamed := onboardInput()
	renamed.Facility.DepartmentName, renamed.Facility.TeamName = "リハビリ部", "B チーム"
	if res, err := onboard(ctx, renamed); err != nil || res.ManagerCreated || res.Manager.ID != m.ID {
		t.Fatalf("名前を変えた流し直し = %+v, %v", res, err)
	}
	if got := onboardRows(t, pool); !maps.Equal(got, want) {
		t.Errorf("名前を変えた流し直しの後の行の数 = %v, want %v", got, want)
	}
}

// ブローカーへの登録か有効化が失敗すると、予定の API に事業所も職員も残らない。上流の IdP の設定に無い組織の ID も、登録の失敗になる。
// ブローカーが直ってから同じ引数で流し直すと登録できる。
func TestOnboardRollsBackWhenBrokerFails(t *testing.T) {
	brokerErr := errors.New("ブローカーが 400 を返した")
	tests := []struct {
		name, db string
		set      func(*inmem.Identities)
	}{
		{"登録", "onboard_rollback_register", func(ids *inmem.Identities) {
			ids.Err = apperr.Invalid("組織 org-new は上流の IdP の設定にありません")
		}},
		{"有効化", "onboard_rollback_activate", func(ids *inmem.Identities) { ids.ActivateErr = brokerErr }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pool := onboardDB(t, tt.db)
			ids := inmem.NewIdentities()
			tt.set(ids)
			if _, err := onboardWith(pool, ids)(context.Background(), onboardInput()); err == nil {
				t.Fatal("err = nil, want ブローカーの失敗")
			}
			noRows(t, pool)
			// ブローカーが直ってから同じ引数で流し直すと、ブローカーの職員を 1 人にまとめて登録できる
			ids.Err, ids.ActivateErr = nil, nil
			res, err := onboardWith(pool, ids)(context.Background(), onboardInput())
			if err != nil {
				t.Fatal(err)
			}
			if !res.ManagerCreated || len(ids.Members) != 1 || ids.Members[*res.Manager.Sub].Pending {
				t.Errorf("流し直しの結果 = %+v, ブローカーの職員 = %v", res, ids.Members)
			}
			if got := onboardRows(t, pool); got["facilities"] != 1 || got["users"] != 1 || got["positions"] != 4 {
				t.Errorf("行の数 = %v", got)
			}
		})
	}
}

// 書き込まずに内容を表示するモードは、DB とブローカーに何も書かない。
func TestOnboardDryRunWritesNothing(t *testing.T) {
	pool := onboardDB(t, "onboard_dry_run")
	ids := inmem.NewIdentities()
	in := onboardInput()
	in.DryRun = true
	res, err := onboardWith(pool, ids)(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Setup.FacilityCreated || !res.ManagerCreated || res.Manager.Username != in.Username || res.Manager.PositionName != "マネージャー" {
		t.Errorf("書く内容 = %+v", res)
	}
	noRows(t, pool)
	if len(ids.Members) != 0 {
		t.Errorf("ブローカーの職員 = %v, want いない", ids.Members)
	}
}

// 有効なマネージャーがいる事業所にマネージャーを足すのは、明示のフラグを付けたときだけ許す。
func TestOnboardAdditionalManager(t *testing.T) {
	pool := onboardDB(t, "onboard_additional")
	ids := inmem.NewIdentities()
	onboard := onboardWith(pool, ids)
	ctx := context.Background()
	if _, err := onboard(ctx, onboardInput()); err != nil {
		t.Fatal(err)
	}
	second := onboardInput()
	second.Email = "kai.ito@example.com"
	_, err := onboard(ctx, second)
	if ce, ok := errors.AsType[*apperr.ConflictError](err); !ok || ce.Code != staff.CodeManagerExists {
		t.Fatalf("err = %v, want %s の 409", err, staff.CodeManagerExists)
	}
	if strings.Contains(err.Error(), second.Email) {
		t.Errorf("err %q にメールが入っている", err)
	}
	second.AllowAdditionalManager = true
	res, err := onboard(ctx, second)
	if err != nil {
		t.Fatal(err)
	}
	if !res.ManagerCreated || res.Setup.FacilityCreated {
		t.Errorf("結果 = %+v", res)
	}
	if got := onboardRows(t, pool); got["users"] != 2 || got["positions"] != 4 {
		t.Errorf("行の数 = %v", got)
	}
}

// 同じ組織の ID の事業所が別の名前であれば、名前を変えずに止める。
func TestOnboardRejectsDifferentFacilityName(t *testing.T) {
	pool := onboardDB(t, "onboard_name")
	onboard := onboardWith(pool, inmem.NewIdentities())
	ctx := context.Background()
	if _, err := onboard(ctx, onboardInput()); err != nil {
		t.Fatal(err)
	}
	in := onboardInput()
	in.Facility.Name = "別の名前"
	if _, err := onboard(ctx, in); !errors.Is(err, apperr.ErrConflict) {
		t.Fatalf("err = %v, want 409", err)
	}
	var name string
	if err := pool.QueryRow(ctx, "SELECT name FROM facilities").Scan(&name); err != nil || name != "新しい事業所" {
		t.Errorf("事業所の名前 = %q, err = %v", name, err)
	}
}
