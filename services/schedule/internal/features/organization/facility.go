package organization

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// SourceMode は、事業所の予定の管理先である（ADR-0029）。
type SourceMode string

// SourceMode の値。遷移は google_primary から buddy_primary の 1 つだけで、移行（Cutover）を完了したときに起きる。
const (
	// SourceGooglePrimary の事業所は、予定を Google カレンダーで管理し、予定の API から予定を書けない。新しい事業所のデフォルトである。
	SourceGooglePrimary SourceMode = "google_primary"
	// SourceBuddyPrimary の事業所は、予定を buddy で管理し、予定を書け、Google カレンダーへ書き出す。
	SourceBuddyPrimary SourceMode = "buddy_primary"
)

// Facility は、訪問看護の事業所である。
type Facility struct {
	ID   string
	Name string
	// OrgID は、ID ブローカーの組織の ID で、結び付けるまで空である。
	OrgID      string
	SourceMode SourceMode
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// IsBuddyPrimary は、事業所が予定を buddy で管理しているかを返す。
func (f Facility) IsBuddyPrimary() bool {
	return f.SourceMode == SourceBuddyPrimary
}

// CodeSourceModeTransition は、事業所の予定の管理先を移せないことを表す 409 の code である。
const CodeSourceModeTransition = "source_mode_transition"

// RequireSourceModeTransition は、事業所の予定の管理先を from から to に移せるかを確認する。
// 移せるのは google_primary から buddy_primary の 1 つだけで、ほかの組み合わせは code が CodeSourceModeTransition の
// apperr.ErrConflict を返す（ADR-0029）。
func RequireSourceModeTransition(from, to SourceMode) error {
	if from == SourceGooglePrimary && to == SourceBuddyPrimary {
		return nil
	}
	return apperr.ConflictCode(CodeSourceModeTransition, "事業所の予定の管理先を %s から %s に移せません", from, to)
}
