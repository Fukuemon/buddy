package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/db"
	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// seedAokiStaffManage は、シードの青木の職員の管理の権限である。青木は、シードの事業所で職員の管理の権限を持つ唯一の職員である。
const seedAokiStaffManage = "01M5E5GP6Q8BQYNWN66QHJF60K"

// auditRow は、permission_audits の 1 行のうち、テストが比べる列である。
type auditRow struct {
	Action, ActorKind          string
	ActorUserID, ActorOperator *string
	TargetUserID, TargetPos    *string
	Before, After              []byte
	RequestID                  string
}

// auditRows は、相関 ID requestID の記録を、ID の順に読む。
func auditRows(t *testing.T, pool *pgxpool.Pool, requestID string) []auditRow {
	t.Helper()
	rows, err := pool.Query(context.Background(), `
		SELECT action, actor_kind, actor_user_id, actor_operator, target_user_id, target_position_id, before, after, request_id
		FROM permission_audits WHERE request_id = $1 ORDER BY id`, requestID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []auditRow
	for rows.Next() {
		var r auditRow
		if err := rows.Scan(&r.Action, &r.ActorKind, &r.ActorUserID, &r.ActorOperator, &r.TargetUserID, &r.TargetPos, &r.Before, &r.After, &r.RequestID); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

// staffStateOf は、職員 d の、記録に持つ全量を返す。staff の書く記録と同じ形である。
func staffStateOf(d staff.Detail) audit.StaffState {
	grants := make([]audit.Grant, 0, len(d.Policies))
	for _, g := range d.Policies {
		grants = append(grants, audit.Grant{Code: string(g.PolicyCode), TargetUserIDs: g.TargetUserIDs, TargetTeamIDs: g.TargetTeamIDs})
	}
	return audit.NewStaffState(d.PositionID, d.TeamID, grants)
}

// decodeState は、記録の JSON の全量を読む。JSON のキーが StaffState と違えば、読んだ値は空になり、比べると違う。
func decodeState(t *testing.T, b []byte) audit.StaffState {
	t.Helper()
	var s audit.StaffState
	if err := json.Unmarshal(b, &s); err != nil {
		t.Fatalf("記録の JSON %s: %v", b, err)
	}
	return audit.NewStaffState(s.PositionID, s.TeamID, s.Grants)
}

// TestPermissionAudit は、職員の権限を変える 6 つの操作が、操作と同じトランザクションで記録を 1 行書くことと、
// 失敗した操作と記録を書けない操作が、記録も権限の変更も残さないことを、DB で確認する（ADR-0042、#992 の検証の観点 1〜4）。
// 書いた行がほかのテストの読む行に混ざらないよう、テストごとのデータベースで確認する。
func TestPermissionAudit(t *testing.T) {
	cfg := newDatabase(t, "permission_audit")
	bg := context.Background()
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	if applied, err := Seed(bg, cfg, db.Seed); err != nil || !applied {
		t.Fatalf("seed: applied = %v, err = %v", applied, err)
	}
	pool, err := Open(bg, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	allow := func(context.Context) error { return nil }
	self := func(context.Context) (string, bool) { return seedAoki, true }
	rec := audit.NewRecorder(NewPermissionAuditRepository(pool), ulid.Generator{}, self)
	staffRepo, facilities, txr, ids := NewStaffRepository(pool), NewFacilityRepository(pool), NewTransactor(pool), ulid.Generator{}
	addGrant := func(rec audit.Recorder) staff.AddGrant {
		return staff.NewAddGrant(staffRepo, NewPolicyRepository(pool), NewTeamRepository(pool), rec, txr, ids, allow)
	}
	get := func(t *testing.T, id string) staff.Detail {
		t.Helper()
		d, err := staffRepo.Get(bg, id)
		if err != nil {
			t.Fatal(err)
		}
		return d
	}
	// one は、相関 ID requestID の記録が、青木が target に action をした 1 行だけかを確認して返す。
	one := func(t *testing.T, requestID, action string) auditRow {
		t.Helper()
		rows := auditRows(t, pool, requestID)
		if len(rows) != 1 {
			t.Fatalf("記録 = %d 行, want 1 行", len(rows))
		}
		r := rows[0]
		if r.Action != action || r.ActorKind != "staff" || r.ActorUserID == nil || *r.ActorUserID != seedAoki || r.ActorOperator != nil {
			t.Errorf("記録 = %+v, want 青木の %s", r, action)
		}
		return r
	}
	// requireStates は、記録の変更の前後が、操作の前の職員 before と後の職員 after の全量と同じかを確認する。
	requireStates := func(t *testing.T, r auditRow, before staff.Detail, after staff.Detail) {
		t.Helper()
		if got, want := decodeState(t, r.Before), staffStateOf(before); !got.Equal(want) {
			t.Errorf("before = %s, want %+v", r.Before, want)
		}
		if got, want := decodeState(t, r.After), staffStateOf(after); !got.Equal(want) {
			t.Errorf("after = %s, want %+v", r.After, want)
		}
	}

	t.Run("ほかの職員に権限を足すと、操作した職員、対象の職員、変更の前後の権限が残る", func(t *testing.T) {
		before := get(t, seedMori)
		ctx := audit.WithRequestID(bg, "REQUEST-GRANT-ADD")
		if _, err := addGrant(rec).Do(ctx, seedMori, staff.GrantInput{PolicyID: seedUserRead, TargetUserIDs: []string{seedHayashi}}); err != nil {
			t.Fatal(err)
		}
		r := one(t, "REQUEST-GRANT-ADD", "grant.add")
		if r.TargetUserID == nil || *r.TargetUserID != seedMori {
			t.Errorf("対象 = %v, want 森", r.TargetUserID)
		}
		requireStates(t, r, before, get(t, seedMori))
		if !strings.Contains(string(r.After), `"target_user_ids": ["`+seedHayashi+`"]`) {
			t.Errorf("after = %s, want 林を対象にする権限", r.After)
		}
	})

	t.Run("権限を外すと grant.remove が残る", func(t *testing.T) {
		before := get(t, seedHayashi)
		var userRead string
		for _, g := range before.Policies {
			if g.PolicyCode == organization.ScheduleUserRead {
				userRead = g.UserPolicyID
			}
		}
		ctx := audit.WithRequestID(bg, "REQUEST-GRANT-REMOVE")
		if _, err := staff.NewRemoveGrant(staffRepo, facilities, rec, txr, allow).Do(ctx, seedHayashi, userRead); err != nil {
			t.Fatal(err)
		}
		requireStates(t, one(t, "REQUEST-GRANT-REMOVE", "grant.remove"), before, get(t, seedHayashi))
	})

	t.Run("役職を変えると、変更の前後の権限の全量が残る", func(t *testing.T) {
		before := get(t, seedHayashi)
		ctx := audit.WithRequestID(bg, "REQUEST-POSITION-CHANGE")
		if _, err := staff.NewChangePosition(staffRepo, facilities, NewPositionRepository(pool), rec, txr, ids, allow).Do(ctx, seedHayashi, seedLeader); err != nil {
			t.Fatal(err)
		}
		after := get(t, seedHayashi)
		requireStates(t, one(t, "REQUEST-POSITION-CHANGE", "position.change"), before, after)
		if after.PositionID != seedLeader {
			t.Errorf("役職 = %s, want リーダー", after.PositionID)
		}
	})

	t.Run("チームを変えて対象を移すと team.change が残る", func(t *testing.T) {
		before := get(t, seedMori)
		ctx := audit.WithRequestID(bg, "REQUEST-TEAM-CHANGE")
		updateProfile := staff.NewUpdateProfile(staffRepo, facilities, NewDepartmentRepository(pool), NewTeamRepository(pool), NewStaffAssignmentReader(pool), nil, rec, txr, allow)
		if _, err := updateProfile.Do(ctx, seedMori, staff.Profile{Username: before.Username, DepartmentID: before.DepartmentID, TeamID: seedTeam, NonVisiting: before.NonVisiting}); err != nil {
			t.Fatal(err)
		}
		after := get(t, seedMori)
		requireStates(t, one(t, "REQUEST-TEAM-CHANGE", "team.change"), before, after)
		if staffStateOf(after).GrantsEqual(staffStateOf(before)) {
			t.Error("権限の対象が移っていない")
		}
	})

	t.Run("職員を登録すると、デフォルトからコピーした権限が after に残る", func(t *testing.T) {
		ctx := audit.WithRequestID(bg, "REQUEST-STAFF-CREATE")
		create := staff.NewCreate(facilities, NewDepartmentRepository(pool), NewTeamRepository(pool), NewPositionRepository(pool), inmem.NewIdentities(), staffRepo, rec, txr, ids, allow)
		created, err := create.Do(ctx, staff.CreateInput{
			FacilityID: seedFacility, Username: "監査 太郎", Email: "taro.audit@example.com",
			DepartmentID: seedDepartment, TeamID: seedTeam, PositionID: seedLeader,
		})
		if err != nil {
			t.Fatal(err)
		}
		r := one(t, "REQUEST-STAFF-CREATE", "staff.create")
		if r.Before != nil || r.TargetUserID == nil || *r.TargetUserID != created.ID {
			t.Errorf("before = %s, 対象 = %v, want 変更の前を持たず、登録した職員が対象", r.Before, r.TargetUserID)
		}
		after := decodeState(t, r.After)
		if !after.Equal(staffStateOf(get(t, created.ID))) || len(after.Grants) != 3 {
			t.Errorf("after = %s, want リーダーのデフォルトの 3 つの権限", r.After)
		}
	})

	t.Run("役職を作ると、名前とデフォルトの権限の code が残る", func(t *testing.T) {
		ctx := audit.WithRequestID(bg, "REQUEST-POSITION-CREATE")
		createPosition := organization.NewCreatePosition(facilities, NewPolicyRepository(pool), NewPositionRepository(pool), rec, txr, ids, allow)
		created, err := createPosition.Do(ctx, seedFacility, "主任", []string{seedTeamRead, seedSelfEdit})
		if err != nil {
			t.Fatal(err)
		}
		r := one(t, "REQUEST-POSITION-CREATE", "position.create")
		if r.TargetPos == nil || *r.TargetPos != created.ID || r.TargetUserID != nil || r.Before != nil {
			t.Errorf("記録 = %+v, want 作った役職が対象で、変更の前を持たない", r)
		}
		if got, want := string(r.After), `{"name": "主任", "policy_codes": ["schedule.self.edit", "schedule.team.read"]}`; got != want {
			t.Errorf("after = %s, want %s", got, want)
		}
	})

	t.Run("最後の有効な管理者から職員の管理の権限を外す 409 では、記録が残らず権限も変わらない", func(t *testing.T) {
		ctx := audit.WithRequestID(bg, "REQUEST-LAST-MANAGER")
		if _, err := staff.NewRemoveGrant(staffRepo, facilities, rec, txr, allow).Do(ctx, seedAoki, seedAokiStaffManage); !errors.Is(err, apperr.ErrConflict) {
			t.Fatalf("err = %v, want ErrConflict", err)
		}
		if rows := auditRows(t, pool, "REQUEST-LAST-MANAGER"); len(rows) != 0 {
			t.Errorf("記録 = %+v, want 残らない", rows)
		}
		if managers, err := staffRepo.ActiveManagers(bg, seedFacility); err != nil || len(managers) != 1 || managers[0] != seedAoki {
			t.Errorf("有効な管理者 = %v, err = %v, want 青木の権限が残る", managers, err)
		}
	})

	t.Run("記録を書けないときは、権限の変更も戻る", func(t *testing.T) {
		before := get(t, seedMori)
		// 操作した職員が DB にいないので、記録の外部キーが書き込みを拒む
		missing := audit.NewRecorder(NewPermissionAuditRepository(pool), ulid.Generator{}, func(context.Context) (string, bool) { return "01M3TD0000000000000000NONE", true })
		ctx := audit.WithRequestID(bg, "REQUEST-AUDIT-FAILS")
		if _, err := addGrant(missing).Do(ctx, seedMori, staff.GrantInput{PolicyID: seedViewPolicy}); err == nil {
			t.Fatal("記録を書けないのに成功した")
		}
		if got := get(t, seedMori); !staffStateOf(got).Equal(staffStateOf(before)) {
			t.Errorf("権限 = %+v, want 変わらない %+v", got.Policies, before.Policies)
		}
		if rows := auditRows(t, pool, "REQUEST-AUDIT-FAILS"); len(rows) != 0 {
			t.Errorf("記録 = %+v, want 残らない", rows)
		}
	})
}

// TestPermissionAuditConstraints は、操作した人の種類と 2 つの列の組が合わない行と、操作ごとの対象と変更の前後が合わない行を、
// DB が拒むことを確認する（ADR-0042 の記録の中身、#992 の完了の条件）。
func TestPermissionAuditConstraints(t *testing.T) {
	ctx := txContext(t)
	w := NewPermissionAuditRepository(testDB)
	after := audit.NewStaffState(seedMember, seedTeam, nil)
	valid := audit.Record{
		ID: ulid.Generator{}.NewID(), FacilityID: seedFacility, Action: audit.GrantAdd, ActorKind: audit.ActorStaff, ActorUserID: seedAoki,
		TargetUserID: seedMori, Before: after, After: after, RequestID: "REQUEST-CONSTRAINTS",
	}
	if err := w.Write(ctx, valid); err != nil {
		t.Fatalf("合う行: %v", err)
	}
	migrated := audit.Record{
		ID: ulid.Generator{}.NewID(), FacilityID: seedFacility, Action: audit.GrantMigrate, ActorKind: audit.ActorOperator, ActorOperator: "migration:000099",
		TargetUserID: seedMori, After: after, RequestID: "REQUEST-CONSTRAINTS",
	}
	if err := w.Write(ctx, migrated); err != nil {
		t.Fatalf("マイグレーションの行: %v", err)
	}
	tests := []struct {
		name       string
		edit       func(r *audit.Record)
		constraint string
	}{
		{"operator で actor_operator が空", func(r *audit.Record) {
			r.Action, r.ActorKind, r.ActorUserID = audit.GrantMigrate, audit.ActorOperator, ""
		}, "permission_audits_actor_check"},
		{"staff で actor_user_id が空", func(r *audit.Record) { r.ActorUserID = "" }, "permission_audits_actor_check"},
		{"staff で actor_operator も持つ", func(r *audit.Record) { r.ActorOperator = "operator-1" }, "permission_audits_actor_check"},
		{"運営者の grant.add", func(r *audit.Record) {
			r.ActorKind, r.ActorUserID, r.ActorOperator = audit.ActorOperator, "", "operator-1"
		}, "permission_audits_action_actor_check"},
		{"職員の grant.migrate", func(r *audit.Record) { r.Action = audit.GrantMigrate }, "permission_audits_action_actor_check"},
		{"256 文字の actor_operator", func(r *audit.Record) {
			r.Action, r.ActorKind, r.ActorUserID, r.ActorOperator = audit.GrantMigrate, audit.ActorOperator, "", strings.Repeat("a", 256)
		}, "permission_audits_actor_operator_check"},
		{"grant.add で before が無い", func(r *audit.Record) { r.Before = nil }, "permission_audits_target_check"},
		{"grant.add で対象の職員が無い", func(r *audit.Record) { r.TargetUserID = "" }, "permission_audits_target_check"},
		{"staff.create で before を持つ", func(r *audit.Record) { r.Action = audit.StaffCreate }, "permission_audits_target_check"},
		{"知らない操作", func(r *audit.Record) { r.Action = "staff.leave" }, "permission_audits_action_check"},
		{"相関 ID が空", func(r *audit.Record) { r.RequestID = "" }, "permission_audits_request_id_check"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := valid
			r.ID = ulid.Generator{}.NewID()
			tt.edit(&r)
			err := w.Write(ctx, r)
			if err == nil || !strings.Contains(err.Error(), tt.constraint) {
				t.Errorf("err = %v, want %s の違反", err, tt.constraint)
			}
		})
	}
}

// TestMigratePermissionAudits は、監査のテーブルを作るマイグレーションが、その時点の全ての職員に、before が空で after が
// その時点の権限の全量の grant.migrate の行を 1 行ずつ書き、全ての行を 1 つの相関 ID でつなぐことを確認する（#992 の検証の観点 5）。
func TestMigratePermissionAudits(t *testing.T) {
	cfg := newDatabase(t, "migrate_permission_audits")
	ctx := context.Background()
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	if err := MigrateDown(cfg, 1); err != nil {
		t.Fatal(err)
	}
	if applied, err := Seed(ctx, cfg, db.Seed); err != nil || !applied {
		t.Fatalf("seed: applied = %v, err = %v", applied, err)
	}
	if err := MigrateUp(cfg); err != nil {
		t.Fatal(err)
	}
	pool, err := Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	var users, rows, requests int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM users), count(*), count(DISTINCT request_id) FROM permission_audits`).Scan(&users, &rows, &requests); err != nil {
		t.Fatal(err)
	}
	if users == 0 || rows != users || requests != 1 {
		t.Fatalf("職員 = %d、記録 = %d 行、相関 ID = %d 個, want 職員ごとに 1 行で 1 つの相関 ID", users, rows, requests)
	}
	var requestID string
	if err := pool.QueryRow(ctx, `SELECT request_id FROM permission_audits LIMIT 1`).Scan(&requestID); err != nil {
		t.Fatal(err)
	}
	staffRepo := NewStaffRepository(pool)
	seen := map[string]bool{}
	for _, r := range auditRows(t, pool, requestID) {
		if r.Action != "grant.migrate" || r.ActorKind != "operator" || r.ActorUserID != nil ||
			r.ActorOperator == nil || *r.ActorOperator != "migration:000024" || r.Before != nil || r.TargetUserID == nil {
			t.Errorf("記録 = %+v, want migration:000024 の before が空の grant.migrate", r)
			continue
		}
		seen[*r.TargetUserID] = true
		d, err := staffRepo.Get(ctx, *r.TargetUserID)
		if err != nil {
			t.Fatal(err)
		}
		// 予定の API が書く記録と同じ形で読めれば、マイグレーションの後の記録と比べられる
		if got, want := decodeState(t, r.After), staffStateOf(d); !got.Equal(want) {
			t.Errorf("%s の after = %s, want %+v", *r.TargetUserID, r.After, want)
		}
	}
	if len(seen) != users {
		t.Errorf("記録のある職員 = %d 人, want %d 人", len(seen), users)
	}
	if err := MigrateDown(cfg, 1); err != nil {
		t.Fatal(err)
	}
}
