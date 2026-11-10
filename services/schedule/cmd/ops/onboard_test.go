package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

func validArgs() []string {
	return []string{
		"--org-id", "org-new", "--facility-name", "新しい事業所", "--department", "看護部", "--team", "A チーム",
		"--manager-name", "新井 真央", "--manager-email", "Mao.Arai@example.com", "--operator", "ops-01",
	}
}

func TestParseOnboardArgs(t *testing.T) {
	a, err := parseOnboardArgs(append(validArgs(), "--dry-run"), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if a.Operator != "ops-01" || !a.DryRun || a.AllowAdditionalManager || a.Facility.OrgID != "org-new" || a.Email != "Mao.Arai@example.com" {
		t.Errorf("got %+v", a)
	}
}

func TestParseOnboardArgsErrors(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want string
	}{
		{"実行者が無い", validArgs()[:len(validArgs())-2], "--operator"},
		{"実行者がメール", append(validArgs()[:len(validArgs())-1], "ops@example.com"), "--operator"},
		{"知らない引数", append(validArgs(), "extra"), "extra"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := parseOnboardArgs(tt.args, io.Discard); err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("err = %v, want %q を含むエラー", err, tt.want)
			}
		})
	}
}

func TestRunRejectsUnknownCommand(t *testing.T) {
	var stderr bytes.Buffer
	if code := run([]string{"create-admin"}, func(string) string { return "" }, io.Discard, &stderr); code != 2 || !strings.Contains(stderr.String(), "usage") {
		t.Errorf("code = %d, stderr = %q", code, stderr.String())
	}
}

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
	a, err := parseOnboardArgs(validArgs(), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	do := func(_ context.Context, in staff.OnboardInput) (staff.OnboardResult, error) {
		res := staff.OnboardResult{ManagerCreated: true}
		res.Setup.Facility = organization.Facility{ID: "FAC1", OrgID: in.Facility.OrgID, Name: in.Facility.Name}
		res.Setup.FacilityCreated = true
		res.Manager.ID, res.Manager.Username, res.Manager.Email = "STAFF1", in.Username, in.Email
		return res, nil
	}
	if err := onboardFacility(context.Background(), do, a, slog.New(slog.NewJSONHandler(&buf, nil))); err != nil {
		t.Fatal(err)
	}
	m := record(t, &buf)
	for k, want := range map[string]any{"actor": "ops-01", "operation": "facility.onboard", "facility_id": "FAC1", "staff_id": "STAFF1", "manager_created": true} {
		if m[k] != want {
			t.Errorf("%s = %v, want %v", k, m[k], want)
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
