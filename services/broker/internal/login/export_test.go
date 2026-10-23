package login

import "time"

// SetLimiterClock は、テストで l の今の時刻を now に替える。
func SetLimiterClock(l *Limiter, now func() time.Time) { l.now = now }
