package calendarexport_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"slices"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// claimRecorder は、待ちのリポジトリを包み、Claim が返した待ちの数を順に記録する。
// claim を与えると、Claim の代わりに呼ぶ。afterBacklog を与えると、Backlog の後に呼ぶ。
type claimRecorder struct {
	calendarexport.ExportRepository
	claims       []int
	claim        func(ctx context.Context, max int, lease time.Duration) ([]calendar.Export, error)
	afterBacklog func(r *claimRecorder)
}

func (r *claimRecorder) Claim(ctx context.Context, max int, lease time.Duration) ([]calendar.Export, error) {
	claim := r.ExportRepository.Claim
	if r.claim != nil {
		claim = r.claim
	}
	jobs, err := claim(ctx, max, lease)
	r.claims = append(r.claims, len(jobs))
	return jobs, err
}

func (r *claimRecorder) Backlog(ctx context.Context) (calendarexport.Backlog, error) {
	bl, err := r.ExportRepository.Backlog(ctx)
	if r.afterBacklog != nil {
		r.afterBacklog(r)
	}
	return bl, err
}

// runExporter は、待ちのリポジトリを r で包んだ Exporter の Run を、interval の間隔で、ctx が終わるまで動かし、書いたログを返す。
func runExporter(ctx context.Context, e exportEnv, r *claimRecorder, interval time.Duration) *bytes.Buffer {
	r.ExportRepository = e.deps.Exports
	deps := e.deps
	deps.Exports = r
	logs := &bytes.Buffer{}
	calendarexport.NewExporter(deps, ulid.Generator{}, slog.New(slog.NewJSONHandler(logs, nil))).Run(ctx, interval)
	return logs
}

// 常駐の書き出しは、取った数が 1 回の上限（5 件）に届く間は、間隔を待たずに続けて取る（#674）。
// 12 件の待ちは、最初の間隔のうちに 5 件、5 件、2 件の 3 回に分けて書き、次の間隔を待つ。
func TestExportRunDrainsBacklogWithinInterval(t *testing.T) {
	e := newExportEnv(t)
	for range 12 {
		e.create(t, "訪問")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	r := &claimRecorder{afterBacklog: func(r *claimRecorder) {
		// 上限に届かなかった後に、間隔を待たずにもう 1 回取らないことを見るため、少し待ってから止める。
		if r.claims[len(r.claims)-1] < 5 {
			time.AfterFunc(100*time.Millisecond, cancel)
		}
	}}
	runExporter(ctx, e, r, time.Hour)
	if want := []int{5, 5, 2}; !slices.Equal(r.claims, want) {
		t.Errorf("取った待ちの数 = %v, want %v", r.claims, want)
	}
	for _, x := range e.store.Exports {
		if x.Status != calendar.ExportSucceeded {
			t.Errorf("書いていない待ち = %+v", x)
		}
	}
}

// 待ちが無ければ、間隔ごとに 1 回だけ取りに行く。
func TestExportRunClaimsOncePerIntervalWhenIdle(t *testing.T) {
	e := newExportEnv(t)
	ctx, cancel := context.WithTimeout(t.Context(), 275*time.Millisecond)
	defer cancel()
	r := &claimRecorder{}
	runExporter(ctx, e, r, 50*time.Millisecond)
	// 始めに 1 回と、50 ミリ秒ごとに 1 回で、275 ミリ秒の間に 6 回になる。時間の揺れを見込んで幅を持たせる。
	if n := len(r.claims); n < 2 || n > 7 {
		t.Errorf("取りに行った回数 = %d, want 2 から 7", n)
	}
}

// 取った後に止める合図を受けたら、新しく取るのをやめ、取った待ちの結果を書いてから終わる。
func TestExportRunStopsClaimingOnShutdown(t *testing.T) {
	e := newExportEnv(t)
	for range 12 {
		e.create(t, "訪問")
	}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	r := &claimRecorder{}
	r.claim = func(ctx context.Context, max int, lease time.Duration) ([]calendar.Export, error) {
		jobs, err := r.ExportRepository.Claim(ctx, max, lease)
		cancel()
		return jobs, err
	}
	runExporter(ctx, e, r, time.Hour)
	if want := []int{5}; !slices.Equal(r.claims, want) {
		t.Errorf("取った待ちの数 = %v, want %v", r.claims, want)
	}
	for _, x := range e.store.Exports {
		if x.Status != calendar.ExportPending || x.Attempts != 0 {
			t.Errorf("止めた後の待ち = %+v", x)
		}
	}
}

// 待ちを取れなければ、ログに書き、間隔を待ってから取り直す。
func TestExportRunRetriesClaimAfterInterval(t *testing.T) {
	e := newExportEnv(t)
	ctx, cancel := context.WithTimeout(t.Context(), 275*time.Millisecond)
	defer cancel()
	r := &claimRecorder{claim: func(context.Context, int, time.Duration) ([]calendar.Export, error) {
		return nil, errors.New("DB に繋がらない")
	}}
	logs := runExporter(ctx, e, r, 50*time.Millisecond)
	if n := len(r.claims); n < 2 || n > 7 {
		t.Errorf("取りに行った回数 = %d, want 2 から 7", n)
	}
	if !bytes.Contains(logs.Bytes(), []byte(`"msg":"calendar export"`)) || !bytes.Contains(logs.Bytes(), []byte("DB に繋がらない")) {
		t.Errorf("取れなかったことをログに書いていない:\n%s", logs)
	}
}
