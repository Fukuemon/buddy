package upstream

import "time"

// SetClock は、テストで rp の今の時刻を now に替える。
func SetClock(rp *RP, now func() time.Time) { rp.now = now }
