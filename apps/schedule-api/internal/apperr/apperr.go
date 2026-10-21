// Package apperr は、機能のパッケージとアダプタが共有する誤りを持つ。httpapi が HTTP のステータスに対応させる。
// 標準ライブラリにだけ依存する。
package apperr

import (
	"errors"
	"fmt"
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
// Code は、利用者が原因で分岐するための値で、空なら httpapi は conflict を返す。
type ConflictError struct {
	Code    string
	Message string
}

func (e *ConflictError) Error() string { return e.Message }

// Is は、target が ErrConflict のときに true を返す。
func (e *ConflictError) Is(target error) bool { return target == ErrConflict }

// Conflict は、書式で組み立てた文を持つ ConflictError を返す。
func Conflict(format string, args ...any) error {
	return &ConflictError{Message: fmt.Sprintf(format, args...)}
}

// ConflictCode は、原因の code と、書式で組み立てた文を持つ ConflictError を返す。
func ConflictCode(code, format string, args ...any) error {
	return &ConflictError{Code: code, Message: fmt.Sprintf(format, args...)}
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
