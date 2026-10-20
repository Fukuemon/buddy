package organization_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
)

func TestNewPosition(t *testing.T) {
	p1 := organization.Policy{ID: "P1"}
	p2 := organization.Policy{ID: "P2"}
	tests := []struct {
		name     string
		posName  string
		policies []organization.Policy
		wantErr  bool
	}{
		{name: "権限なし", posName: "リーダー"},
		{name: "権限あり", posName: "リーダー", policies: []organization.Policy{p1, p2}},
		{name: "権限が重なる", posName: "リーダー", policies: []organization.Policy{p1, p1}, wantErr: true},
		{name: "名前がない", posName: "", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := organization.NewPosition("ID", "F", tt.posName, tt.policies)
			if tt.wantErr != (err != nil) {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, domain.ErrInvalidInput) {
				t.Errorf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func TestNewTeamAndPolicy(t *testing.T) {
	if _, err := organization.NewTeam("ID", "F", ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("NewTeam err = %v", err)
	}
	if _, err := organization.NewPolicy("ID", " "); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("NewPolicy err = %v", err)
	}
}
