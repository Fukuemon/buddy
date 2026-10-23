package login

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Limiter は、メールの有無を確認する試行の回数を、送り手のアドレスか入れたメールのようなキーごとに制限する（ADR-0017）。
// 1 つのプロセスの中だけで数える。複数のプロセスで動かすときは、プロセスの数だけ上限が増える。
type Limiter struct {
	every time.Duration
	burst int
	now   func() time.Time

	mu      sync.Mutex
	clients map[string]*client
	swept   time.Time
}

type client struct {
	limiter *rate.Limiter
	seen    time.Time
}

// NewLimiter は、キーごとに burst 回まで続けて試せ、every ごとに 1 回ずつ戻る Limiter を作る。
func NewLimiter(every time.Duration, burst int) *Limiter {
	return &Limiter{every: every, burst: burst, now: time.Now, clients: map[string]*client{}}
}

// Allow は、キー key の試行を 1 回数え、上限の中なら true を返す。
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweep(now)
	c, ok := l.clients[key]
	if !ok {
		c = &client{limiter: rate.NewLimiter(rate.Every(l.every), l.burst)}
		l.clients[key] = c
	}
	c.seen = now
	return c.limiter.AllowN(now, 1)
}

// sweep は、上限まで戻ったキーを消し、覚えるキーが増え続けないようにする。
func (l *Limiter) sweep(now time.Time) {
	full := l.every * time.Duration(l.burst)
	if now.Sub(l.swept) < full {
		return
	}
	for key, c := range l.clients {
		if now.Sub(c.seen) >= full {
			delete(l.clients, key)
		}
	}
	l.swept = now
}
