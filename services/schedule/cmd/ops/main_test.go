package main

import (
	"bytes"
	"io"
	"strings"
	"testing"
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
		{"空白で切れた名前の残り", append(validArgs(), "真央"), "1 個"},
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

// -h は使い方を出して 0 で終わり、読めない引数は flag のエラーを 1 回だけ出して 2 で終わる。
func TestRunFlagErrors(t *testing.T) {
	var stderr bytes.Buffer
	if code := run([]string{"onboard-facility", "-h"}, func(string) string { return "" }, io.Discard, &stderr); code != 0 {
		t.Errorf("-h の終了コード = %d", code)
	}
	stderr.Reset()
	if code := run([]string{"onboard-facility", "--no-such-flag"}, func(string) string { return "" }, io.Discard, &stderr); code != 2 || strings.Count(stderr.String(), "no-such-flag") != 1 {
		t.Errorf("code = %d, stderr = %q", code, stderr.String())
	}
}
