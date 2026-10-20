package visit_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

func TestNewInfo(t *testing.T) {
	staffA, staffB := "A", "B"
	tests := []struct {
		name    string
		info    visit.Info
		wantErr bool
	}{
		{name: "同行者なし", info: visit.Info{AssignedStaffID: staffA}},
		{name: "別の同行者", info: visit.Info{AssignedStaffID: staffA, CompanionID: &staffB}},
		{name: "同行者が担当と同じ", info: visit.Info{AssignedStaffID: staffA, CompanionID: &staffA}, wantErr: true},
		{name: "区分が重なる", info: visit.Info{AssignedStaffID: staffA, CategoryIDs: []string{"C", "C"}}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := visit.NewInfo(tt.info)
			if tt.wantErr != (err != nil) {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, domain.ErrInvalidInput) {
				t.Errorf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}
