package main

import (
	"context"
	"log/slog"
	"sync"

	"github.com/Fukuemon/buddy/packages/go/oidc"
)

// lazyVerifier は、内部の API が初めて access token を受けたときに、Hydra の discovery の文書を読んで oidc.Verifier を作る。
// 起動の時に読まないのは、ログインの画面を Hydra の issuer に届かない構成（ローカル環境で go run するブローカー）でも
// 動かすためである。読めなければ、その呼び出しを失敗にし、次の呼び出しで読み直す。
type lazyVerifier struct {
	ctx context.Context
	cfg oidc.Config
	log *slog.Logger
	mu  sync.Mutex
	v   *oidc.Verifier
}

// Verify は、作った oidc.Verifier で raw を検証する。
func (l *lazyVerifier) Verify(ctx context.Context, raw string) (oidc.Identity, error) {
	l.mu.Lock()
	if l.v == nil {
		v, err := oidc.NewVerifier(l.ctx, l.cfg, nil, l.log)
		if err != nil {
			l.mu.Unlock()
			return oidc.Identity{}, err
		}
		l.v = v
	}
	v := l.v
	l.mu.Unlock()
	return v.Verify(ctx, raw)
}
