package oidc

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"
)

// discoveryRetryInterval は、StartVerifier が discovery を読めなかった後に、読み直すまでの間隔である。
// Hydra が戻ってから、API がトークンを受けられるまでの時間の上限になる（ADR-0044 の「冗長化」）。
const discoveryRetryInterval = 5 * time.Second

// ErrNotReady は、discovery をまだ読めていないので、トークンを検証できないことを表す。
// トークンの誤りではないので、受けた側は 401 ではなく 503 を返す。
var ErrNotReady = errors.New("oidc: Issuer の discovery の文書をまだ読めていません")

// StartingVerifier は、バックグラウンドで discovery を読み、読めたら Verifier として働く。
// 読めるまでの Verify と Ready は ErrNotReady を返し、トークンを通さない。複数の goroutine から同時に使える。
type StartingVerifier struct {
	v atomic.Pointer[Verifier]
}

// StartVerifier は、NewVerifier が成功するまで、5 秒ごとにバックグラウンドで試す StartingVerifier を返す。
// Issuer に届かない間も、呼び出し側は起動を続けられる。失敗するたびに WARN のログを 1 行出す。
// 1 度読めたら試すのをやめ、discovery を読み直さない。JWKS の取り直しは Verifier が続ける。
// ctx が終わると、試すのをやめる。client と log の扱いは NewVerifier と同じである。
func StartVerifier(ctx context.Context, cfg Config, client *http.Client, log *slog.Logger) *StartingVerifier {
	return startVerifier(ctx, cfg, client, log, discoveryRetryInterval)
}

func startVerifier(ctx context.Context, cfg Config, client *http.Client, log *slog.Logger, interval time.Duration) *StartingVerifier {
	s := &StartingVerifier{}
	go func() {
		for {
			v, err := NewVerifier(ctx, cfg, client, log)
			if err == nil {
				s.v.Store(v)
				log.InfoContext(ctx, "oidc discovery loaded", slog.String("issuer", cfg.Issuer))
				return
			}
			log.WarnContext(ctx, "oidc discovery failed", slog.String("issuer", cfg.Issuer),
				slog.Duration("retry_in", interval), slog.Any("error", err))
			select {
			case <-ctx.Done():
				return
			case <-time.After(interval):
			}
		}
	}()
	return s
}

// Ready は、discovery を読めていれば nil を、まだなら ErrNotReady を返す。
func (s *StartingVerifier) Ready() error {
	if s.v.Load() == nil {
		return ErrNotReady
	}
	return nil
}

// Verify は、discovery を読めていれば Verifier の Verify で raw を検証し、まだなら ErrNotReady を返す。
func (s *StartingVerifier) Verify(ctx context.Context, raw string) (Identity, error) {
	v := s.v.Load()
	if v == nil {
		return Identity{}, ErrNotReady
	}
	return v.Verify(ctx, raw)
}
