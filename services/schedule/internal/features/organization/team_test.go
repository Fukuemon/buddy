package organization_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

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
