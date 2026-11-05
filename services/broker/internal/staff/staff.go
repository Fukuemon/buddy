// Package staff は、ブローカーが身元を持つ職員の型、状態、規則、番兵のエラーを持つ（ADR-0015）。
//
// ログインの画面（login）、内部の API（internalapi）、DB のアダプタ（postgres）が、このパッケージを読む。
// staff は、ブローカーのほかの内部のパッケージを import しない。
package staff

import (
	"errors"
	"time"
)

// SessionMaxAge は、上流の IdP でログインしてから、トークンを発行してよい長さである。Hydra がログインのセッションを保つ長さと、
// web のセッションの長さを、これと同じにする（ADR-0015）。上流で止めたアカウントは、この長さを過ぎた次の上流のログインで拒まれる。
const SessionMaxAge = 12 * time.Hour

// 職員の状態。有効な職員にだけトークンを出す。登録の途中の職員は、予定の API が職員を書き終えると有効になる。
// 止めた職員（StatusSuspended）は休職で、復職で有効に戻る。退職した職員（StatusRetired）はメールと上流のアカウントを持たず、戻らない。
const (
	StatusPending   = "pending"
	StatusActive    = "active"
	StatusSuspended = "suspended"
	StatusRetired   = "retired"
)

// Transition は、職員の状態の遷移である。From のいずれかの状態の職員だけを To にする。
// To の状態の職員も From に含め、同じ遷移を送り直しても成功させる。
// 値は Activation、Resumption、Suspension で作る。ほかの方法で作った値の Refuse は panic する。
type Transition struct {
	To   string
	From []string
	// refuse は、From にない状態の職員の遷移を拒むエラーを返す。
	refuse func(status string) error
}

// Refuse は、From にない状態 status の職員の遷移を拒む番兵のエラーを返す。status が From にあるときの値は決めない。
func (t Transition) Refuse(status string) error {
	return t.refuse(status)
}

// Activation は、登録の途中の職員を有効にする遷移を返す。止めた職員は ErrSuspended で、退職した職員は ErrRetired で拒む。
func Activation() Transition {
	return Transition{
		To:   StatusActive,
		From: []string{StatusPending, StatusActive},
		refuse: func(status string) error {
			if status == StatusRetired {
				return ErrRetired
			}
			return ErrSuspended
		},
	}
}

// Resumption は、止めた職員を有効に戻す復職の遷移を返す。退職した職員は ErrRetired で、登録の途中の職員は ErrNotSuspended で拒む。
func Resumption() Transition {
	return Transition{
		To:   StatusActive,
		From: []string{StatusSuspended, StatusActive},
		refuse: func(status string) error {
			if status == StatusRetired {
				return ErrRetired
			}
			return ErrNotSuspended
		},
	}
}

// Suspension は、職員を止める休職の遷移を返す。退職した職員を ErrRetired で拒む。
func Suspension() Transition {
	return Transition{
		To:     StatusSuspended,
		From:   []string{StatusPending, StatusActive, StatusSuspended},
		refuse: func(string) error { return ErrRetired },
	}
}

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
