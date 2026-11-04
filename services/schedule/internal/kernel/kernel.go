// Package kernel は、機能のパッケージが共有する値の検証、一覧の並べ替え、ID の発行と 1 件の読み出しのインターフェース、権限の確認の型を持つ。
// 標準ライブラリと apperr にだけ依存する。
package kernel

import (
	"context"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// IDGenerator は、エンティティの新しい ID を発行する。
type IDGenerator interface {
	NewID() string
}

// Finder は、ID が id の 1 件を読む。見つからないときは apperr.ErrNotFound を返す。
// 機能のパッケージは、ほかの機能のリポジトリのインターフェースの代わりに、要る型の Finder だけを受ける。
type Finder[T any] interface {
	Get(ctx context.Context, id string) (T, error)
}

// Guard は、ctx の職員が職員の管理（StaffManage）を許されているかを確認し、許されないときは apperr.ErrForbidden を返す。
// principal が organization と staff に依存するので、機能のパッケージは principal の判定を import せずに受け取る（ADR-0006）。
type Guard func(ctx context.Context) error

// ValidateText は、value が空白だけか maxLen 文字を超えるときに apperr.ValidationError を返す。
// label は、エラーの文で項目を指す名前である。
func ValidateText(label, value string, maxLen int) error {
	if strings.TrimSpace(value) == "" {
		return apperr.Invalid("%sは必須です", label)
	}
	if utf8.RuneCountInString(value) > maxLen {
		return apperr.Invalid("%sは%d文字以内です", label, maxLen)
	}
	return nil
}

// Sort は、検証済みの一覧の並べ替えである。
type Sort struct {
	Field      string
	Descending bool
}

// Key は、一覧のクエリが分岐に使う並べ替えのキーを返す。例は "date_asc"。
func (s Sort) Key() string {
	if s.Descending {
		return s.Field + "_desc"
	}
	return s.Field + "_asc"
}

// ParseSort は、allowedFields にあるカラムと、向き "asc" か "desc" だけを受け付け、ほかは apperr.ValidationError を返す。
// field が空なら def を返し、order が空なら昇順とする。
func ParseSort(field, order string, allowedFields []string, def Sort) (Sort, error) {
	descending := false
	switch order {
	case "", "asc":
	case "desc":
		descending = true
	default:
		return Sort{}, apperr.Invalid("sort_order は asc か desc です")
	}
	if field == "" {
		if order != "" {
			def.Descending = descending
		}
		return def, nil
	}
	if slices.Contains(allowedFields, field) {
		return Sort{Field: field, Descending: descending}, nil
	}
	return Sort{}, apperr.Invalid("sort_field は %s のいずれかです", strings.Join(allowedFields, ", "))
}
