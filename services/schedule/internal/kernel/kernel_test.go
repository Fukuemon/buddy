package kernel_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

func TestParseSort(t *testing.T) {
	allowed := []string{"date", "start_time"}
	def := kernel.Sort{Field: "date"}
	tests := []struct {
		name    string
		field   string
		order   string
		want    kernel.Sort
		wantErr bool
	}{
		{name: "デフォルト", want: def},
		{name: "デフォルトのカラムで降順", order: "desc", want: kernel.Sort{Field: "date", Descending: true}},
		{name: "許可したカラムで昇順", field: "start_time", order: "asc", want: kernel.Sort{Field: "start_time"}},
		{name: "許可したカラムで向きを省略", field: "start_time", want: kernel.Sort{Field: "start_time"}},
		{name: "SQL を混ぜたカラム", field: "start_time;DROP", wantErr: true},
		{name: "許可していないカラム", field: "staff_id", wantErr: true},
		{name: "大文字の向き", field: "date", order: "DESC", wantErr: true},
		{name: "SQL を混ぜた向き", field: "date", order: "asc, id", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := kernel.ParseSort(tt.field, tt.order, allowed, def)
			if tt.wantErr {
				if !errors.Is(err, apperr.ErrInvalidInput) {
					t.Fatalf("err = %v, want ErrInvalidInput", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestSortKey(t *testing.T) {
	if got := (kernel.Sort{Field: "date"}).Key(); got != "date_asc" {
		t.Errorf("got %q", got)
	}
	if got := (kernel.Sort{Field: "date", Descending: true}).Key(); got != "date_desc" {
		t.Errorf("got %q", got)
	}
}

func TestRequireText(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{name: "上限ちょうど", value: "あいう", wantErr: false},
		{name: "上限を超える", value: "あいうえ", wantErr: true},
		{name: "空", value: "", wantErr: true},
		{name: "空白だけ", value: "  ", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := kernel.ValidateText("名前", tt.value, 3)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, apperr.ErrInvalidInput) {
				t.Errorf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}
