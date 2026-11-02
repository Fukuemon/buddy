package login

import (
	"net/http"
	"time"
)

// SetLimiterClock は、テストで l の今の時刻を now に替える。
func SetLimiterClock(l *Limiter, now func() time.Time) { l.now = now }

// LimiterKeys は、テストで l が覚えているキーの数を返す。
func LimiterKeys(l *Limiter) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.clients)
}

// ClientAddr は、テストで clientAddr を呼ぶ。
func ClientAddr(r *http.Request, header string) string { return clientAddr(r, header) }
