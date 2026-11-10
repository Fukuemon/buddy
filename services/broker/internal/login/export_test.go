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

// SignCookie は、テストで key の鍵で payload に署名した、ログインの途中の cookie の値を返す。
func SignCookie(key string, payload []byte) string {
	return cookieSigner{keys: [][]byte{[]byte(key)}}.sign(payload)
}

// SetNow は、テストで cookie の発行の時刻と期限に使う今の時刻を f に替え、戻す関数を返す。
func SetNow(f func() time.Time) (restore func()) {
	now = f
	return func() { now = time.Now }
}
