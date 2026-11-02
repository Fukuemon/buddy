package patient_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
)

func TestNew(t *testing.T) {
	valid := patient.Patient{Name: "利用者 一郎", PreferredTime: patient.Morning, PreferredGender: patient.Female}
	tests := []struct {
		name    string
		edit    func(*patient.Patient)
		wantErr bool
	}{
		{name: "正しい値", edit: func(*patient.Patient) {}},
		{name: "名前がない", edit: func(p *patient.Patient) { p.Name = "" }, wantErr: true},
		{name: "時間帯が不明", edit: func(p *patient.Patient) { p.PreferredTime = "夜" }, wantErr: true},
		{name: "性別が不明", edit: func(p *patient.Patient) { p.PreferredGender = "" }, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := valid
			tt.edit(&p)
			_, err := patient.New(p)
			if tt.wantErr != (err != nil) {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, apperr.ErrInvalidInput) {
				t.Errorf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}
