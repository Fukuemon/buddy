package login

import "time"

// SetLimiterClock は、テストで l の今の時刻を now に替える。
func SetLimiterClock(l *Limiter, now func() time.Time) { l.now = now }

// LimiterKeys は、テストで l が覚えているキーの数を返す。
func LimiterKeys(l *Limiter) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.clients)
}
