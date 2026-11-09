package staff_test

import (
	"cmp"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

func ptr[T any](v T) *T { return &v }

func TestNew(t *testing.T) {
	valid := staff.NewParams{ID: "ID", Username: "青木 陽菜", Email: "hina.aoki@example.com"}
	tests := []struct {
		name      string
		edit      func(*staff.NewParams)
		wantErr   bool
		wantPhone *string
		wantEmail string
	}{
		{name: "必須だけ", edit: func(*staff.NewParams) {}},
		{name: "電話番号に + を付ける", edit: func(p *staff.NewParams) { p.PhoneNumber = ptr("09000000000") }, wantPhone: ptr("+09000000000")},
		{name: "+ 付きの電話番号はそのまま", edit: func(p *staff.NewParams) { p.PhoneNumber = ptr("+8190000000") }, wantPhone: ptr("+8190000000")},
		{name: "+ 付きで 12 桁", edit: func(p *staff.NewParams) { p.PhoneNumber = ptr("+819000000000") }, wantErr: true},
		{name: "電話番号に記号", edit: func(p *staff.NewParams) { p.PhoneNumber = ptr("090-0000") }, wantErr: true},
		{name: "電話番号が 12 桁", edit: func(p *staff.NewParams) { p.PhoneNumber = ptr("090000000000") }, wantErr: true},
		{name: "名前がない", edit: func(p *staff.NewParams) { p.Username = "" }, wantErr: true},
		{name: "名前が 129 文字", edit: func(p *staff.NewParams) { p.Username = strings.Repeat("あ", 129) }, wantErr: true},
		{name: "メールに @ がない", edit: func(p *staff.NewParams) { p.Email = "example.com" }, wantErr: true},
		{name: "メールのドメインに . がない", edit: func(p *staff.NewParams) { p.Email = "a@example" }, wantErr: true},
		{name: "メールがない", edit: func(p *staff.NewParams) { p.Email = "" }, wantErr: true},
		{name: "メールを小文字にそろえる", edit: func(p *staff.NewParams) { p.Email = "Hina.Aoki@Example.COM" }, wantEmail: "hina.aoki@example.com"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := valid
			tt.edit(&p)
			got, err := staff.New(p)
			if tt.wantErr {
				if !errors.Is(err, apperr.ErrInvalidInput) {
					t.Fatalf("err = %v, want ErrInvalidInput", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if (got.PhoneNumber == nil) != (tt.wantPhone == nil) ||
				(got.PhoneNumber != nil && *got.PhoneNumber != *tt.wantPhone) {
				t.Errorf("PhoneNumber = %v, want %v", got.PhoneNumber, tt.wantPhone)
			}
			if want := cmp.Or(tt.wantEmail, p.Email); got.Email != want {
				t.Errorf("Email = %q, want %q", got.Email, want)
			}
		})
	}
}

func TestParseSort(t *testing.T) {
	got, err := staff.ParseSort("", "")
	if err != nil || got != (kernel.Sort{Field: "updated_at", Descending: true}) {
		t.Fatalf("got %+v, %v", got, err)
	}
	if _, err := staff.ParseSort("username;DROP TABLE users", "asc"); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
}

func TestStatusTransitions(t *testing.T) {
	now := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	checks := []struct {
		name  string
		check func(staff.Staff) error
	}{
		{name: "休職", check: staff.Staff.RequireLeavable},
		{name: "復職", check: staff.Staff.RequireReinstatable},
		{name: "情報の変更", check: staff.Staff.RequireProfileEditable},
	}
	states := []struct {
		name    string
		staff   staff.Staff
		wantErr bool
	}{
		{name: "有効", staff: staff.Staff{ID: "S1"}},
		{name: "休職", staff: staff.Staff{ID: "S1", LeaveStartedAt: &now}},
		{name: "退職", staff: staff.Staff{ID: "S1", RetiredAt: &now}, wantErr: true},
	}
	for _, c := range checks {
		for _, s := range states {
			t.Run(c.name+"/"+s.name, func(t *testing.T) {
				err := c.check(s.staff)
				if s.wantErr != errors.Is(err, apperr.ErrConflict) || (!s.wantErr && err != nil) {
					t.Errorf("err = %v, wantErr %v", err, s.wantErr)
				}
			})
		}
	}
}
