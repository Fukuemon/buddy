package staff

import "strings"

// MaxEmailLen は、職員のメールの長さの上限（バイト）である。
const MaxEmailLen = 320

// NormalizeEmail は、メール email の前後の空白を除き、小文字にそろえる。職員のメールは、この形で持ち、この形で引く。
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// ValidEmail は、NormalizeEmail でそろえたメール email が、職員のメールの形（@ の前後が空でなく、MaxEmailLen 以下）かを返す。
// ログインの画面と、内部の API の職員の登録が、同じ形で確認する。
func ValidEmail(email string) bool {
	local, host, ok := strings.Cut(email, "@")
	return ok && local != "" && host != "" && len(email) <= MaxEmailLen
}
