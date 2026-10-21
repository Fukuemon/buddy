// Package domain は、機能のパッケージが共有するエラー、ポート、値の検証を持つ。
// 標準ライブラリにだけ依存する。
package domain

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// httpapi が HTTP のステータスに対応させる番兵のエラー。
var (
	ErrNotFound     = errors.New("リソースが見つかりません")
	ErrInvalidInput = errors.New("入力の内容が不正です")
	ErrConflict     = errors.New("同じ内容のデータがすでにあります")
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

// ConflictError は、操作が今の状態と衝突する理由を表す。errors.Is では ErrConflict として扱われる。
type ConflictError struct {
	Message string
}

func (e *ConflictError) Error() string { return e.Message }

// Is は、target が ErrConflict のときに true を返す。
func (e *ConflictError) Is(target error) bool { return target == ErrConflict }

// Conflict は、書式で組み立てた文を持つ ConflictError を返す。
func Conflict(format string, args ...any) error {
	return &ConflictError{Message: fmt.Sprintf(format, args...)}
}

// AsConflict は、err が衝突のときに、書式で組み立てた文を持つ ConflictError に置き換える。ほかの err はそのまま返す。
// リポジトリが一意の制約から返す原因の分からない衝突に、呼び出し側が原因の文を付ける。
func AsConflict(err error, format string, args ...any) error {
	if errors.Is(err, ErrConflict) {
		return Conflict(format, args...)
	}
	return err
}

// Reference は、リクエストの本文が指す ID が見つからない err を、入力の誤りに置き換える。
// パスで指したリソースと違い、本文の ID が見つからないことは 404 ではなく 400 で返す。
func Reference(label, id string, err error) error {
	if errors.Is(err, ErrNotFound) {
		return Invalid("%s %s が見つかりません", label, id)
	}
	return err
}

// SameFacility は、参照した ownerFacilityID が facilityID と違うときに入力の誤りを返す。
func SameFacility(label, id, ownerFacilityID, facilityID string) error {
	if ownerFacilityID != facilityID {
		return Invalid("%s %s はこの事業所に属していません", label, id)
	}
	return nil
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
