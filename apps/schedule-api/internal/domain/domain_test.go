package domain_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
)

func TestParseSort(t *testing.T) {
	allowed := []string{"date", "start_time"}
	def := domain.Sort{Field: "date"}
	tests := []struct {
		name    string
		field   string
		order   string
		want    domain.Sort
		wantErr bool
	}{
		{name: "既定", want: def},
		{name: "既定の列で降順", order: "desc", want: domain.Sort{Field: "date", Desc: true}},
		{name: "許可した列で昇順", field: "start_time", order: "asc", want: domain.Sort{Field: "start_time"}},
		{name: "許可した列で向きを省略", field: "start_time", want: domain.Sort{Field: "start_time"}},
		{name: "SQL を混ぜた列", field: "start_time;DROP", wantErr: true},
		{name: "許可していない列", field: "staff_id", wantErr: true},
		{name: "大文字の向き", field: "date", order: "DESC", wantErr: true},
		{name: "SQL を混ぜた向き", field: "date", order: "asc, id", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := domain.ParseSort(tt.field, tt.order, allowed, def)
			if tt.wantErr {
				if !errors.Is(err, domain.ErrInvalidInput) {
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
	if got := (domain.Sort{Field: "date"}).Key(); got != "date_asc" {
		t.Errorf("got %q", got)
	}
	if got := (domain.Sort{Field: "date", Desc: true}).Key(); got != "date_desc" {
		t.Errorf("got %q", got)
	}
}

func TestValidID(t *testing.T) {
	tests := []struct {
		id   string
		want bool
	}{
		{"01J6SMYDSKKKNJCR2Y3242T7YX", true},
		{"7ZZZZZZZZZZZZZZZZZZZZZZZZZ", true},
		{"8ZZZZZZZZZZZZZZZZZZZZZZZZZ", false},
		{"01J6SMYDSKKKNJCR2Y3242T7Y", false},
		{"01J6SMYDSKKKNJCR2Y3242T7YXX", false},
		{"01J6SMYDSKKKNJCR2Y3242T7YU", false},
		{"01j6smydskkknjcr2y3242t7yx", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := domain.ValidID(tt.id); got != tt.want {
			t.Errorf("ValidID(%q) = %v, want %v", tt.id, got, tt.want)
		}
	}
}

func TestConflict(t *testing.T) {
	err := domain.Conflict("%s の回はすでに置き換えられています", "2026-10-12")
	if !errors.Is(err, domain.ErrConflict) || err.Error() != "2026-10-12 の回はすでに置き換えられています" {
		t.Errorf("Conflict = %v", err)
	}
}

func TestAsConflict(t *testing.T) {
	tests := []struct {
		name    string
		err     error
		wantIs  error
		wantMsg string
	}{
		{name: "衝突", err: domain.ErrConflict, wantIs: domain.ErrConflict, wantMsg: "チーム 訪問 はこの事業所にすでにあります"},
		{name: "ほかの誤り", err: domain.ErrNotFound, wantIs: domain.ErrNotFound, wantMsg: domain.ErrNotFound.Error()},
		{name: "誤りなし"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := domain.AsConflict(tt.err, "チーム %s はこの事業所にすでにあります", "訪問")
			if tt.wantIs == nil {
				if got != nil {
					t.Errorf("got %v, want nil", got)
				}
				return
			}
			if !errors.Is(got, tt.wantIs) || got.Error() != tt.wantMsg {
				t.Errorf("got %v, want %q", got, tt.wantMsg)
			}
		})
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
			err := domain.RequireText("名前", tt.value, 3)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, domain.ErrInvalidInput) {
				t.Errorf("err = %v, want ErrInvalidInput", err)
			}
		})
	}
}
