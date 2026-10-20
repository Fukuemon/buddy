// Package domain は、domain のパッケージが共有するエラー、ポート、値の検証を持つ。
// domain のパッケージは標準ライブラリにだけ依存する。
package domain

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// presentation の層が HTTP のステータスに対応させる番兵のエラー。
var (
	ErrNotFound     = errors.New("リソースが見つかりません")
	ErrInvalidInput = errors.New("入力の内容が不正です")
	ErrConflict     = errors.New("リソースがすでに存在します")
	ErrForbidden    = errors.New("この操作は許可されていません")
)

// ValidationError は、入力が不正な理由を表す。errors.Is では ErrInvalidInput として扱われる。
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

// Is は、target が ErrInvalidInput のときに true を返す。
func (e *ValidationError) Is(target error) bool { return target == ErrInvalidInput }

// Invalid は、書式で組み立てた文を持つ ValidationError を返す。
func Invalid(format string, args ...any) error {
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}

// IDGenerator は、エンティティの新しい ID を発行する。
type IDGenerator interface {
	NewID() string
}

// Transactor は、fn をトランザクションの中で実行する。fn に渡した ctx を受け取ったリポジトリの呼び出しは、
// そのトランザクションに加わる。fn が nil を返すとコミットし、それ以外はロールバックする。
type Transactor interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// ValidID は、s が 26 文字の正規の形の ULID かを返す。
func ValidID(s string) bool {
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

// RequireText は、value が空白だけか maxLen 文字を超えるときに ValidationError を返す。
// label は、エラーの文で項目を指す名前である。
func RequireText(label, value string, maxLen int) error {
	if strings.TrimSpace(value) == "" {
		return Invalid("%sは必須です", label)
	}
	if utf8.RuneCountInString(value) > maxLen {
		return Invalid("%sは%d文字以内です", label, maxLen)
	}
	return nil
}

// Sort は、検証済みの一覧の並べ替えである。
type Sort struct {
	Field string
	Desc  bool
}

// Key は、一覧のクエリが分岐に使う並べ替えのキーを返す。例は "date_asc"。
func (s Sort) Key() string {
	if s.Desc {
		return s.Field + "_desc"
	}
	return s.Field + "_asc"
}

// ParseSort は、allowed にある列と、向き "asc" か "desc" だけを受け付け、ほかは ValidationError を返す。
// field が空なら def を返し、order が空なら昇順とする。
func ParseSort(field, order string, allowed []string, def Sort) (Sort, error) {
	desc := false
	switch order {
	case "", "asc":
	case "desc":
		desc = true
	default:
		return Sort{}, Invalid("sort_order は asc か desc です")
	}
	if field == "" {
		if order != "" {
			def.Desc = desc
		}
		return def, nil
	}
	for _, f := range allowed {
		if f == field {
			return Sort{Field: field, Desc: desc}, nil
		}
	}
	return Sort{}, Invalid("sort_field は %s のいずれかです", strings.Join(allowed, ", "))
}
