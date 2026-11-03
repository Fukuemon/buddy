// Package staff は、ブローカーが身元を持つ職員の型、状態、規則、番兵のエラーを持つ（ADR-0017）。
//
// ログインの画面（login）、内部の API（internalapi）、DB のアダプタ（postgres）が、このパッケージを読む。
// staff は、ブローカーのほかの内部のパッケージを import しない。
package staff

import (
	"errors"
	"time"
)

// SessionMaxAge は、上流の IdP でログインしてから、トークンを発行してよい長さである。Hydra がログインのセッションを保つ長さと、
// web のセッションの長さを、これと同じにする（ADR-0017）。上流で止めたアカウントは、この長さを過ぎた次の上流のログインで拒まれる。
const SessionMaxAge = 12 * time.Hour

// 職員の状態。有効な職員にだけトークンを出す。登録の途中の職員は、予定の API が職員を書き終えると有効になる。
// 止めた職員（StatusSuspended）は休職で、復職で有効に戻る。退職した職員（StatusRetired）はメールと上流のアカウントを持たず、戻らない。
const (
	StatusPending   = "pending"
	StatusActive    = "active"
	StatusSuspended = "suspended"
	StatusRetired   = "retired"
)

// UpstreamAccount は、職員に結び付けた上流の IdP のアカウントである。結び付けていなければ値は空である。
type UpstreamAccount struct {
	Issuer  string
	Subject string
}

// Member は、ブローカーが身元を持つ職員である。退職した職員の Email は空である。
type Member struct {
	ID       string
	OrgID    string
	Email    string
	Status   string
	Upstream UpstreamAccount
}

// CanLogin は、職員にログインとトークンの発行を許すか（有効な職員か）を返す。
func (m Member) CanLogin() bool {
	return m.Status == StatusActive
}

// Error は、職員の状態の約束に反したことを示す番兵のエラーである。
type Error struct {
	// Code は、内部の API が応答の code に入れる機械向けの値である。予定の API が、この値で分岐する。
	Code string
	text string
}

// Error は、ログに書くエラーの文を返す。内部の API の応答の文は、internalapi が決める。
func (e *Error) Error() string { return e.text }

var (
	// ErrNotFound は、職員がいないことを示す。
	ErrNotFound = &Error{Code: "not_found", text: "職員がいない"}
	// ErrSuspended は、登録か有効化しようとした職員が止められていることを示す。
	ErrSuspended = &Error{Code: "suspended", text: "職員が止められている"}
	// ErrRetired は、退職した職員を有効にするか、止めるか、戻そうとしたことを示す。
	ErrRetired = &Error{Code: "retired", text: "職員が退職している"}
	// ErrNotPending は、登録の途中でない職員を消そうとしたことを示す。
	ErrNotPending = &Error{Code: "not_pending", text: "職員が登録の途中でない"}
	// ErrNotSuspended は、止めていない職員（登録の途中の職員）を戻そうとしたことを示す。
	ErrNotSuspended = &Error{Code: "not_suspended", text: "職員が止められていない"}
	// ErrEmailTaken は、登録しようとしたメールの職員が、ほかの事業所にいることを示す。
	ErrEmailTaken = &Error{Code: "email_taken", text: "同じメールの職員がほかの事業所にいる"}
)

// ErrConflict は、職員が既に上流のアカウントを持つか、上流のアカウントが別の職員に結び付いているか、職員が有効でないことを示す。
// ログインの画面だけが読み、内部の API の応答にしないので、code を持たない。
var ErrConflict = errors.New("上流のアカウントを結び付けられない")
