package organization_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

func TestNewPosition(t *testing.T) {
	p1 := organization.Policy{ID: "P1"}
	p2 := organization.Policy{ID: "P2"}
	team := organization.Policy{ID: "TEAM", Code: organization.ScheduleTeamRead, NeedsTarget: true}
	user := organization.Policy{ID: "USER", Code: organization.ScheduleUserRead, NeedsTarget: true}
	tests := []struct {
		name     string
		posName  string
		policies []organization.Policy
		wantErr  bool
	}{
		{name: "権限なし", posName: "リーダー"},
		{name: "権限あり", posName: "リーダー", policies: []organization.Policy{p1, p2}},
		{name: "権限が重なる", posName: "リーダー", policies: []organization.Policy{p1, p1}, wantErr: true},
		{name: "チームを対象にする権限", posName: "リーダー", policies: []organization.Policy{team}},
		{name: "職員を対象にする権限", posName: "リーダー", policies: []organization.Policy{user}, wantErr: true},
		{name: "名前がない", posName: "", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := organization.NewPosition("ID", "F", tt.posName, tt.policies)
			if tt.wantErr != (err != nil) {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, apperr.ErrInvalidInput) {
				t.Errorf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func TestNewTeam(t *testing.T) {
	if _, err := organization.NewTeam("ID", "F", "", organization.TeamColorBlue); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("名前が空: err = %v", err)
	}
	if _, err := organization.NewTeam("ID", "F", "A", "red"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("8 色にない色: err = %v", err)
	}
	if got, err := organization.NewTeam("ID", "F", "A", organization.TeamColorLime); err != nil || got.Color != organization.TeamColorLime {
		t.Errorf("NewTeam = %+v, %v", got, err)
	}
}

func TestNextTeamColor(t *testing.T) {
	all := organization.TeamColors()
	tests := []struct {
		name string
		used []organization.TeamColor
		want organization.TeamColor
	}{
		{name: "チームが無い", want: organization.TeamColorBlue},
		{name: "使っていない色の先頭", used: []organization.TeamColor{organization.TeamColorBlue, organization.TeamColorMagenta}, want: organization.TeamColorOrange},
		{name: "8 色を使っている", used: all, want: organization.TeamColorBlue},
		{name: "使っているチームが最も少ない色", used: append(append([]organization.TeamColor{}, all...), all[:3]...), want: organization.TeamColorCyan},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := organization.NextTeamColor(tt.used); got != tt.want {
				t.Errorf("NextTeamColor = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestPolicyCodeTargetsTeam(t *testing.T) {
	for code, want := range map[organization.PolicyCode]bool{
		organization.ScheduleTeamRead: true,
		organization.ScheduleTeamEdit: true,
		organization.ScheduleUserRead: false,
		organization.ScheduleAllEdit:  false,
		organization.ScheduleSelfEdit: false,
	} {
		if got := code.TargetsTeam(); got != want {
			t.Errorf("%s.TargetsTeam() = %v", code, got)
		}
	}
}
