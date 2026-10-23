package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/broker/db"
	"github.com/Fukuemon/buddy/services/broker/internal/login"
)

func TestStaffStore(t *testing.T) {
	pool := migrated(t)
	ctx := context.Background()
	for _, q := range []string{
		`INSERT INTO staff (id, org_id, email) VALUES ('` + staffA + `', 'org-a', 'aoki@example.com')`,
		`INSERT INTO staff (id, org_id, email, status) VALUES ('` + staffB + `', 'org-b', 'aoki@example.com', 'suspended')`,
	} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	s := NewStaffStore(pool)

	found, err := s.FindByEmail(ctx, "aoki@example.com")
	if err != nil || len(found) != 2 || found[0].ID != staffA || found[1].Status != login.StatusSuspended {
		t.Fatalf("FindByEmail = %+v, %v, want 2 つの事業所の職員", found, err)
	}
	if found, err := s.FindByEmail(ctx, "nobody@example.com"); err != nil || len(found) != 0 {
		t.Fatalf("登録していないメールの FindByEmail = %+v, %v", found, err)
	}
	if _, err := s.Get(ctx, "01JCCCCCCCCCCCCCCCCCCCCCCC"); !errors.Is(err, login.ErrNotFound) {
		t.Fatalf("いない職員の Get の err = %v, want ErrNotFound", err)
	}

	a := login.UpstreamAccount{Issuer: "https://idp.example.com", Subject: "sub-a"}
	if err := s.Link(ctx, staffA, a); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(ctx, staffA)
	want := login.StaffMember{ID: staffA, OrgID: "org-a", Email: "aoki@example.com", Status: login.StatusActive, Upstream: a}
	if err != nil || got != want {
		t.Fatalf("Get = %+v, %v, want %+v", got, err, want)
	}
	if err := s.Link(ctx, staffA, login.UpstreamAccount{Issuer: "https://idp.example.com", Subject: "sub-x"}); !errors.Is(err, login.ErrConflict) {
		t.Errorf("2 つ目の上流のアカウントの err = %v, want ErrConflict", err)
	}
	if err := s.Link(ctx, staffB, a); !errors.Is(err, login.ErrConflict) {
		t.Errorf("別の職員に結び付いたアカウントの err = %v, want ErrConflict", err)
	}
}

// TestSeed は、シードが空の DB にだけ入り、2 度目は何もしないことを確かめる。
func TestSeed(t *testing.T) {
	pool := migrated(t)
	ctx := context.Background()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM staff`) })
	for i, want := range []bool{true, false} {
		applied, err := Seed(ctx, testConfig, db.Seed)
		if err != nil || applied != want {
			t.Fatalf("%d 回目の Seed = %v, %v, want %v", i+1, applied, err, want)
		}
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM staff WHERE org_id = 'org-sample-b'`).Scan(&n); err != nil || n != 1 {
		t.Errorf("2 つ目の事業所の職員 = %d 人, %v, want 1", n, err)
	}
}
