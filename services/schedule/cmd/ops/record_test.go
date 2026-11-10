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

func record(t *testing.T, buf *bytes.Buffer) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(buf.Bytes(), &m); err != nil {
		t.Fatalf("ログ %q を読めない: %v", buf.String(), err)
	}
	return m
}

// 登録の記録は、実行者、操作の種類、事業所と職員の ID、相関の ID を持ち、メールと職員の名前を持たない。
func TestOnboardFacilityRecord(t *testing.T) {
	tests := []struct {
		name    string
		dryRun  bool
		created bool
		want    map[string]any
		absent  []string
	}{
		{"登録した", false, true, map[string]any{"facility_id": "FAC1", "staff_id": "STAFF1", "manager_created": true, "msg": "事業所と最初のマネージャーを登録した"}, nil},
		{"登録済み", false, false, map[string]any{"facility_id": "FAC1", "staff_id": "STAFF1", "manager_created": false, "msg": "同じメールの職員が登録済みで、何も書かなかった"}, nil},
		{"dry-run", true, true, map[string]any{"facility_name": "新しい事業所", "manager_position_name": "マネージャー", "dry_run": true}, []string{"facility_id", "staff_id"}},
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
				res := staff.OnboardResult{ManagerCreated: tt.created}
				res.Setup.Facility = organization.Facility{ID: "FAC1", OrgID: in.Facility.OrgID, Name: in.Facility.Name}
				res.Setup.FacilityCreated = tt.created
				res.Setup.ManagerPosition.Name = "マネージャー"
				res.Manager.ID, res.Manager.Username, res.Manager.Email = "STAFF1", in.Username, in.Email
				return res, nil
			}
			if err := onboardFacility(context.Background(), do, a, slog.New(slog.NewJSONHandler(&buf, nil))); err != nil {
				t.Fatal(err)
			}
			m := record(t, &buf)
			want := map[string]any{"actor": "ops-01", "operation": "facility.onboard", "org_id": "org-new"}
			maps.Copy(want, tt.want)
			for k, v := range want {
				if m[k] != v {
					t.Errorf("%s = %v, want %v", k, m[k], v)
				}
			}
			for _, k := range tt.absent {
				if _, ok := m[k]; ok {
					t.Errorf("%s を出した: %v", k, m)
				}
			}
			if id, _ := m["correlation_id"].(string); id == "" {
				t.Errorf("correlation_id が無い: %v", m)
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
