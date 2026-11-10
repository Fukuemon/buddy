package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"maps"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

func records(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("ログ %q を読めない: %v", line, err)
		}
		out = append(out, m)
	}
	return out
}

// 登録の記録は、ADR-0042 の監査の記録の行に合わせ、書いた操作ごとに 1 行を、同じ request_id で書く。
// メールと職員の名前を持たない。
func TestOnboardFacilityRecord(t *testing.T) {
	tests := []struct {
		name            string
		dryRun          bool
		facilityCreated bool
		managerCreated  bool
		want            []map[string]any
		absent          []string
	}{
		{"事業所を作って登録した", false, true, true, []map[string]any{
			{"action": "facility.create", "facility_id": "FAC1"},
			{"action": "position.create", "facility_id": "FAC1", "target_position_id": "POS1"},
			{"action": "position.create", "facility_id": "FAC1", "target_position_id": "POS2"},
			{"action": "staff.create", "facility_id": "FAC1", "target_user_id": "STAFF1"},
		}, nil},
		{"既にある事業所にフラグを付けて登録した", false, false, true, []map[string]any{
			{"action": "staff.create_forced", "facility_id": "FAC1", "target_user_id": "STAFF1"},
		}, nil},
		{"登録済み", false, false, false, []map[string]any{
			{"facility_id": "FAC1", "staff_id": "STAFF1", "msg": "同じメールの職員が登録済みで、何も書かなかった"},
		}, []string{"action"}},
		{"dry-run", true, true, true, []map[string]any{
			{"facility_name": "新しい事業所", "manager_position_name": "マネージャー", "dry_run": true},
		}, []string{"action", "facility_id", "staff_id", "target_user_id"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			args := validArgs()
			if tt.dryRun {
				args = append(args, "--dry-run")
			}
			a, err := parseOnboardArgs(args, io.Discard)
			if err != nil {
				t.Fatal(err)
			}
			var buf bytes.Buffer
			do := func(_ context.Context, in staff.OnboardInput) (staff.OnboardResult, error) {
				res := staff.OnboardResult{ManagerCreated: tt.managerCreated}
				res.Setup.Facility = organization.Facility{ID: "FAC1", OrgID: in.Facility.OrgID, Name: in.Facility.Name}
				res.Setup.FacilityCreated = tt.facilityCreated
				res.Setup.Positions = []organization.Position{{ID: "POS1", Name: "マネージャー"}, {ID: "POS2", Name: "メンバー"}}
				res.Setup.ManagerPosition = res.Setup.Positions[0]
				res.Manager.ID, res.Manager.Username, res.Manager.Email = "STAFF1", in.Username, in.Email
				return res, nil
			}
			if err := onboardFacility(context.Background(), do, a, slog.New(slog.NewJSONHandler(&buf, nil))); err != nil {
				t.Fatal(err)
			}
			got := records(t, &buf)
			if len(got) != len(tt.want) {
				t.Fatalf("記録の行の数 = %d, want %d: %v", len(got), len(tt.want), got)
			}
			requestID, _ := got[0]["request_id"].(string)
			if requestID == "" {
				t.Errorf("request_id が無い: %v", got[0])
			}
			for i, m := range got {
				want := map[string]any{"actor_kind": "operator", "actor_operator": "ops-01", "request_id": requestID}
				maps.Copy(want, tt.want[i])
				for k, v := range want {
					if m[k] != v {
						t.Errorf("行 %d の %s = %v, want %v", i, k, m[k], v)
					}
				}
				for _, k := range tt.absent {
					if _, ok := m[k]; ok {
						t.Errorf("行 %d に %s を出した: %v", i, k, m)
					}
				}
			}
			for _, secret := range []string{"Mao.Arai@example.com", "mao.arai@example.com", "新井 真央"} {
				if strings.Contains(buf.String(), secret) {
					t.Errorf("記録 %q に %q が入っている", buf.String(), secret)
				}
			}
		})
	}
}

// 失敗の記録は、エラーの文に入ったメールを伏せる。
func TestOnboardFacilityFailureRedactsEmail(t *testing.T) {
	a, err := parseOnboardArgs(validArgs(), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	do := func(_ context.Context, in staff.OnboardInput) (staff.OnboardResult, error) {
		return staff.OnboardResult{}, apperr.Conflict("メール %s の職員は登録できません", staff.NormalizeEmail(in.Email))
	}
	if err := onboardFacility(context.Background(), do, a, slog.New(slog.NewJSONHandler(&buf, nil))); !errors.Is(err, errOnboardFailed) {
		t.Fatalf("err = %v", err)
	}
	if strings.Contains(strings.ToLower(buf.String()), "mao.arai@example.com") || !strings.Contains(buf.String(), "<manager-email>") {
		t.Errorf("記録 = %q", buf.String())
	}
}

// LOG_LEVEL を warn にしても、登録の記録は出る。
func TestOnboardFacilityRecordIgnoresWarnLevel(t *testing.T) {
	a, err := parseOnboardArgs(validArgs(), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	do := func(_ context.Context, in staff.OnboardInput) (staff.OnboardResult, error) {
		res := staff.OnboardResult{ManagerCreated: true}
		res.Setup.Facility = organization.Facility{ID: "FAC1", OrgID: in.Facility.OrgID}
		res.Manager.ID = "STAFF1"
		return res, nil
	}
	if err := onboardFacility(context.Background(), do, a, newLogger(&buf, slog.LevelWarn)); err != nil {
		t.Fatal(err)
	}
	if got := records(t, &buf); len(got) != 1 || got[0]["action"] != "staff.create_forced" {
		t.Errorf("記録 = %v, want staff.create_forced の 1 行", got)
	}
}
