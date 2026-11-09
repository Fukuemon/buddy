package staff_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestStaffAddGrant(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name    string
		in      staff.GrantInput
		wantErr error
	}{
		{"対象なしの権限", staff.GrantInput{PolicyID: "SELF"}, nil},
		{"職員を対象にする権限", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{companionID}}, nil},
		{"チームを対象にする権限", staff.GrantInput{PolicyID: "TEAM", TargetTeamIDs: []string{"TEAM"}}, nil},
		{"対象なしの権限に対象", staff.GrantInput{PolicyID: "SELF", TargetUserIDs: []string{companionID}}, apperr.ErrInvalidInput},
		{"職員の権限に対象なし", staff.GrantInput{PolicyID: "USER"}, apperr.ErrInvalidInput},
		{"職員の権限にチーム", staff.GrantInput{PolicyID: "USER", TargetTeamIDs: []string{"TEAM"}}, apperr.ErrInvalidInput},
		{"チームの権限に職員", staff.GrantInput{PolicyID: "TEAM", TargetUserIDs: []string{companionID}}, apperr.ErrInvalidInput},
		{"別の事業所の職員", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{inmem.OtherStaffID}}, apperr.ErrInvalidInput},
		{"別の事業所のチーム", staff.GrantInput{PolicyID: "TEAM", TargetTeamIDs: []string{"OTHERTEAM"}}, apperr.ErrInvalidInput},
		{"重なる対象", staff.GrantInput{PolicyID: "USER", TargetUserIDs: []string{companionID, companionID}}, apperr.ErrInvalidInput},
		{"無い権限", staff.GrantInput{PolicyID: "MISSING"}, apperr.ErrInvalidInput},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := grantStore()
			_, err := newApp(s, allow).AddGrant(ctx, staffID, tt.in)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			g := s.Grants[staffID]
			if len(g) != 1 || g[0].PolicyID != tt.in.PolicyID || len(g[0].Targets) != len(tt.in.TargetUserIDs)+len(tt.in.TargetTeamIDs) {
				t.Errorf("grants = %+v", g)
			}
		})
	}

	s := grantStore()
	uc := newApp(s, allow)
	if _, err := uc.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.AddGrant(ctx, staffID, staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "職員はすでに権限 自分の予定の編集 を持っています" {
		t.Errorf("同じ権限を 2 回: err = %v, want 権限の重なりの ErrConflict", err)
	}
	if _, err := uc.AddGrant(ctx, "MISSING", staff.GrantInput{PolicyID: "SELF"}); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("無い職員: err = %v, want ErrNotFound", err)
	}
}
