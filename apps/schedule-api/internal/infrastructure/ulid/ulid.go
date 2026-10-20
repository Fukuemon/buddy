// Package ulid は、domain.IDGenerator を ULID で実装する。
package ulid

import "github.com/oklog/ulid/v2"

// Generator は、現在の時刻と暗号論的な乱数から ULID を発行する。並行に呼んでよい。
type Generator struct{}

// NewID は、新しい ULID を 26 文字の正規の形で返す。
func (Generator) NewID() string { return ulid.Make().String() }
