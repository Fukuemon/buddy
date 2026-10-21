// Package ulid は、kernel.IDGenerator を ULID で実装し、ID の形を確かめる。
package ulid

import (
	"strings"

	"github.com/oklog/ulid/v2"
)

// Generator は、現在の時刻と暗号論的な乱数から ULID を発行する。並行に呼んでよい。
type Generator struct{}

// NewID は、新しい ULID を 26 文字の正規の形で返す。
func (Generator) NewID() string { return ulid.Make().String() }

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// Valid は、s が 26 文字の正規の形の ULID かを返す。
func Valid(s string) bool {
	if len(s) != 26 || s[0] > '7' {
		return false
	}
	for i := 0; i < len(s); i++ {
		if strings.IndexByte(crockford, s[i]) < 0 {
			return false
		}
	}
	return true
}
