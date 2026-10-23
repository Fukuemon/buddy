package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/broker/db"
	"github.com/Fukuemon/buddy/services/broker/internal/internalapi"
	"github.com/Fukuemon/buddy/services/broker/internal/login"
)

func TestStaffStore(t *testing.T) {
	pool := migrated(t)
	ctx := context.Background()
	for _, q := range []string{
		`INSERT INTO staff (id, org_id, email) VALUES ('` + staffA + `', 'org-a', 'aoki@example.com')`,
		`INSERT INTO staff (id, org_id, email, status) VALUES ('` + staffB + `', 'org-b', 'mori@example.com', 'suspended')`,
	} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	s := NewStaffStore(pool)

	found, err := s.FindByEmail(ctx, "aoki@example.com")
	if err != nil || len(found) != 1 || found[0].ID != staffA {
		t.Fatalf("FindByEmail = %+v, %v, want %s", found, err, staffA)
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

// TestStaffStoreRegisterDeleteSuspend は、登録が同じ事業所の同じメールで 1 人にまとまり、ほかの事業所の同じメールを拒み、
// 有効化と停止が何度でも成功し、削除が登録の途中の職員だけを消すことを確認する。
func TestStaffStoreRegisterDeleteSuspend(t *testing.T) {
	pool := migrated(t)
	ctx := context.Background()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM staff`) })
	s := NewStaffStore(pool)

	m := login.StaffMember{ID: staffA, OrgID: "org-a", Email: "new@example.com", Status: login.StatusPending}
	got, created, err := s.Register(ctx, m)
	if err != nil || !created || got != m {
		t.Fatalf("Register = %+v, %v, %v, want 作った職員", got, created, err)
	}
	again := m
	again.ID = staffB
	got, created, err = s.Register(ctx, again)
	if err != nil || created || got.ID != staffA {
		t.Fatalf("2 度目の Register = %+v, %v, %v, want 作らずに %s", got, created, err, staffA)
	}
	other := again
	other.OrgID = "org-b"
	if got, created, err := s.Register(ctx, other); !errors.Is(err, internalapi.ErrEmailTaken) {
		t.Fatalf("別の事業所の Register = %+v, %v, %v, want ErrEmailTaken", got, created, err)
	}

	for range 2 {
		if err := s.Activate(ctx, staffA); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := s.Get(ctx, staffA); got.Status != login.StatusActive {
		t.Errorf("Activate の後の status = %s", got.Status)
	}
	if err := s.Delete(ctx, staffA); !errors.Is(err, internalapi.ErrNotPending) {
		t.Errorf("有効な職員の Delete の err = %v, want ErrNotPending", err)
	}
	if err := s.Activate(ctx, "01JCCCCCCCCCCCCCCCCCCCCCCC"); !errors.Is(err, login.ErrNotFound) {
		t.Errorf("いない職員の Activate の err = %v, want ErrNotFound", err)
	}

	for range 2 {
		if err := s.Suspend(ctx, staffA); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := s.Get(ctx, staffA); got.Status != login.StatusSuspended {
		t.Errorf("Suspend の後の status = %s", got.Status)
	}
	if err := s.Activate(ctx, staffA); !errors.Is(err, internalapi.ErrSuspended) {
		t.Errorf("止めた職員の Activate の err = %v, want ErrSuspended", err)
	}
	if err := s.Suspend(ctx, "01JCCCCCCCCCCCCCCCCCCCCCCC"); !errors.Is(err, login.ErrNotFound) {
		t.Errorf("いない職員の Suspend の err = %v, want ErrNotFound", err)
	}

	pending := login.StaffMember{ID: staffB, OrgID: "org-b", Email: "pending@example.com", Status: login.StatusPending}
	if _, _, err := s.Register(ctx, pending); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, staffB); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, staffB); !errors.Is(err, login.ErrNotFound) {
		t.Errorf("消した職員の Delete の err = %v, want ErrNotFound", err)
	}
}

// TestStaffStoreResumeRetire は、復職が上流のアカウントを残して有効に戻し、退職がメールと上流のアカウントを消して、
// 同じメールと上流のアカウントで新しい職員を登録し直せることを確認する。退職した職員は止めることも戻すこともできない。
func TestStaffStoreResumeRetire(t *testing.T) {
	pool := migrated(t)
	ctx := context.Background()
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM staff`) })
	s := NewStaffStore(pool)
	if _, err := pool.Exec(ctx, `INSERT INTO staff (id, org_id, email, status) VALUES ($1, 'org-a', 'aoki@example.com', 'suspended')`, staffA); err != nil {
		t.Fatal(err)
	}
	a := login.UpstreamAccount{Issuer: "https://idp.example.com", Subject: "sub-a"}
	if err := s.Link(ctx, staffA, a); err != nil {
		t.Fatal(err)
	}

	for range 2 {
		if err := s.Resume(ctx, staffA); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := s.Get(ctx, staffA); got.Status != login.StatusActive || got.Upstream != a {
		t.Errorf("Resume の後の職員 = %+v, want active で同じ上流のアカウント", got)
	}
	if err := s.Resume(ctx, "01JCCCCCCCCCCCCCCCCCCCCCCC"); !errors.Is(err, login.ErrNotFound) {
		t.Errorf("いない職員の Resume の err = %v, want ErrNotFound", err)
	}

	for range 2 {
		if err := s.Retire(ctx, staffA); err != nil {
			t.Fatal(err)
		}
	}
	got, err := s.Get(ctx, staffA)
	if err != nil || got.Status != login.StatusRetired || got.Email != "" || got.Upstream != (login.UpstreamAccount{}) {
		t.Errorf("Retire の後の職員 = %+v, %v, want retired でメールと上流のアカウントが空", got, err)
	}
	for name, err := range map[string]error{
		"Suspend":  s.Suspend(ctx, staffA),
		"Resume":   s.Resume(ctx, staffA),
		"Activate": s.Activate(ctx, staffA),
	} {
		if !errors.Is(err, internalapi.ErrRetired) {
			t.Errorf("退職した職員の %s の err = %v, want ErrRetired", name, err)
		}
	}
	if got, _ := s.Get(ctx, staffA); got.Status != login.StatusRetired {
		t.Errorf("退職した職員の status = %s, want retired のまま", got.Status)
	}
	if err := s.Retire(ctx, "01JCCCCCCCCCCCCCCCCCCCCCCC"); !errors.Is(err, login.ErrNotFound) {
		t.Errorf("いない職員の Retire の err = %v, want ErrNotFound", err)
	}

	m := login.StaffMember{ID: staffB, OrgID: "org-a", Email: "aoki@example.com", Status: login.StatusPending}
	if got, created, err := s.Register(ctx, m); err != nil || !created || got.ID != staffB {
		t.Fatalf("退職した職員と同じメールの Register = %+v, %v, %v, want 新しい職員", got, created, err)
	}
	if err := s.Link(ctx, staffB, a); err != nil {
		t.Errorf("退職した職員の上流のアカウントを新しい職員に結び付けられない: %v", err)
	}

	if _, err := pool.Exec(ctx, `INSERT INTO staff (id, org_id, email, status) VALUES ('01JCCCCCCCCCCCCCCCCCCCCCCC', 'org-a', 'pending@example.com', 'pending')`); err != nil {
		t.Fatal(err)
	}
	if err := s.Resume(ctx, "01JCCCCCCCCCCCCCCCCCCCCCCC"); !errors.Is(err, internalapi.ErrNotSuspended) {
		t.Errorf("登録の途中の職員の Resume の err = %v, want ErrNotSuspended", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE staff SET status = 'active', email = NULL WHERE id = '01JCCCCCCCCCCCCCCCCCCCCCCC'`); err == nil {
		t.Error("退職していない職員のメールを消せた。staff_retired_email_check が拒むはず")
	}
}

// TestSeed は、シードが空の DB にだけ入り、2 度目は何もしないことと、2 つ目の事業所に有効な職員と止めた職員が入ることを確認する。
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
	var active, suspended int
	if err := pool.QueryRow(ctx, `SELECT count(*) FILTER (WHERE status = 'active'), count(*) FILTER (WHERE status = 'suspended') FROM staff WHERE org_id = 'org-sample-b'`).Scan(&active, &suspended); err != nil || active != 1 || suspended != 1 {
		t.Errorf("2 つ目の事業所の有効な職員 = %d 人、止めた職員 = %d 人, %v, want 1 人と 1 人", active, suspended, err)
	}
}
