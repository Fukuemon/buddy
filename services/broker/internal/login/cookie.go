package login

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

// errBadSignature は、cookie の署名が無いか、どの鍵の署名とも合わないことを示す。
var errBadSignature = errors.New("ログインの途中の値の署名が合わない")

// cookieSigner は、ログインの途中の cookie の値に HMAC-SHA256 で署名し、検証する。
// 先頭の鍵で署名し、全ての鍵で検証する。鍵を替えるときに、古い鍵で署名した cookie のログインを続けさせるためである。
type cookieSigner struct {
	keys [][]byte
}

// sign は、payload を base64url で書き、"." と、先頭の鍵での署名の base64url を続けた値を返す。
func (s cookieSigner) sign(payload []byte) string {
	body := base64.RawURLEncoding.EncodeToString(payload)
	return body + "." + base64.RawURLEncoding.EncodeToString(mac(s.keys[0], body))
}

// verify は、sign の書いた値の署名を全ての鍵で検証し、合えば payload を返す。署名を検証するまで、payload を読まない。
func (s cookieSigner) verify(value string) ([]byte, error) {
	body, sig, ok := strings.Cut(value, ".")
	if !ok {
		return nil, errBadSignature
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return nil, errBadSignature
	}
	for _, key := range s.keys {
		if hmac.Equal(got, mac(key, body)) {
			return base64.RawURLEncoding.DecodeString(body)
		}
	}
	return nil, errBadSignature
}

func mac(key []byte, body string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(body))
	return h.Sum(nil)
}
