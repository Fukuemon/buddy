package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"slices"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
)

func TestDrain(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	t.Run("何も取らなくなるまで繰り返す", func(t *testing.T) {
		batches := []int{5, 5, 2, 0}
		calls := 0
		n, err := drain(t.Context(), func(context.Context) (int, error) {
			calls++
			return batches[calls-1], nil
		}, 0, log)
		if err != nil || n != 12 || calls != 4 {
			t.Errorf("drain = %d, %v, 呼んだ回数 %d", n, err, calls)
		}
	})
	t.Run("結果を書けなくても続ける", func(t *testing.T) {
		calls := 0
		n, err := drain(t.Context(), func(context.Context) (int, error) {
			calls++
			if calls == 1 {
				return 3, errors.New("finish")
			}
			return 0, nil
		}, 0, log)
		if err != nil || n != 3 || calls != 2 {
			t.Errorf("drain = %d, %v, 呼んだ回数 %d", n, err, calls)
		}
	})
	t.Run("取れなければエラーを返す", func(t *testing.T) {
		if _, err := drain(t.Context(), func(context.Context) (int, error) { return 0, errors.New("claim") }, 0, log); err == nil {
			t.Error("エラーを返さない")
		}
	})
	t.Run("止める合図の後は取らない", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		calls := 0
		n, err := drain(ctx, func(ctx context.Context) (int, error) {
			calls++
			cancel()
			return 5, ctx.Err()
		}, 0, log)
		if err != nil || n != 5 || calls != 1 {
			t.Errorf("drain = %d, %v, 呼んだ回数 %d", n, err, calls)
		}
	})
	t.Run("長さの上限を過ぎたら取らない", func(t *testing.T) {
		calls := 0
		n, err := drain(t.Context(), func(context.Context) (int, error) {
			calls++
			time.Sleep(20 * time.Millisecond)
			return 5, nil
		}, 10*time.Millisecond, log)
		if err != nil || n != 5 || calls != 1 {
			t.Errorf("drain = %d, %v, 呼んだ回数 %d", n, err, calls)
		}
	})
}

func TestPollInterval(t *testing.T) {
	for _, tc := range []struct {
		name string
		c    config.Calendar
		want time.Duration
	}{
		{"export", config.Calendar{ExportInterval: 30 * time.Second, SyncInterval: 2 * time.Minute}, 30 * time.Second},
		{"sync", config.Calendar{ExportInterval: 30 * time.Second, SyncInterval: 2 * time.Minute}, 5 * time.Second},
		{"sync", config.Calendar{ExportInterval: 30 * time.Second, SyncInterval: 2 * time.Second}, 2 * time.Second},
	} {
		if got := pollInterval(tc.name, tc.c); got != tc.want {
			t.Errorf("pollInterval(%s, 同期の間隔 %v) = %v, want %v", tc.name, tc.c.SyncInterval, got, tc.want)
		}
	}
}

// backlog は、remaining 件の待ちを 1 回に 5 件まで取る due と、取った数を順に記録する claims を返す。
func backlog(remaining int, claims *[]int) dueFunc {
	return func(context.Context) (int, error) {
		n := min(remaining, 5)
		remaining -= n
		*claims = append(*claims, n)
		return n, nil
	}
}

func TestResident(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	t.Run("待ちが溜まっていれば、間隔を待たずに取れるものが無くなるまで取り、次の間隔を待つ", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
		defer cancel()
		var claims []int
		due := backlog(12, &claims)
		resident(ctx, func(ctx context.Context) (int, error) {
			n, err := due(ctx)
			// 取るものが無くなった後に、間隔を待たずにもう 1 回取らないことを見るため、少し待ってから止める。
			if n == 0 {
				time.AfterFunc(100*time.Millisecond, cancel)
			}
			return n, err
		}, time.Hour, log)
		if want := []int{5, 5, 2, 0}; !slices.Equal(claims, want) {
			t.Errorf("取った数 = %v, want %v", claims, want)
		}
	})
	t.Run("待ちが無ければ、間隔ごとに 1 回だけ取りに行く", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 275*time.Millisecond)
		defer cancel()
		var claims []int
		resident(ctx, backlog(0, &claims), 50*time.Millisecond, log)
		// 始めに 1 回と、50 ミリ秒ごとに 1 回で、275 ミリ秒の間に 6 回になる。時間の揺れを見込んで幅を持たせる。
		if n := len(claims); n < 2 || n > 7 {
			t.Errorf("取りに行った回数 = %d, want 2 から 7", n)
		}
	})
	t.Run("止める合図を受けたら、新しく取らずに終わる", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		calls := 0
		resident(ctx, func(ctx context.Context) (int, error) {
			calls++
			cancel()
			return 5, ctx.Err()
		}, time.Hour, log)
		if calls != 1 {
			t.Errorf("呼んだ回数 = %d, want 1", calls)
		}
	})
	t.Run("取れなければ、ログに書き、間隔を待ってから取り直す", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 275*time.Millisecond)
		defer cancel()
		logs := &bytes.Buffer{}
		calls := 0
		resident(ctx, func(context.Context) (int, error) {
			calls++
			return 0, errors.New("DB に繋がらない")
		}, 50*time.Millisecond, slog.New(slog.NewJSONHandler(logs, nil)))
		if calls < 2 || calls > 7 {
			t.Errorf("取りに行った回数 = %d, want 2 から 7", calls)
		}
		if !bytes.Contains(logs.Bytes(), []byte(`"msg":"calendar worker batch"`)) || !bytes.Contains(logs.Bytes(), []byte("DB に繋がらない")) {
			t.Errorf("取れなかったことをログに書いていない:\n%s", logs)
		}
	})
}
