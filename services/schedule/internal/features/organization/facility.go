package organization

import (
	"time"
)

// SourceMode は、事業所の予定の正本のモードである（ADR-0035）。
type SourceMode string

// SourceMode の値。遷移は google_primary から buddy_primary の 1 つだけで、切り替え（Cutover）を完了したときに起きる。
const (
	// SourceGooglePrimary の事業所は、Google カレンダーが予定の正本で、予定の API から予定を書けない。新しい事業所のデフォルトである。
	SourceGooglePrimary SourceMode = "google_primary"
	// SourceBuddyPrimary の事業所は、buddy が予定の正本で、予定を書け、Google カレンダーへ書き出す。
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

// IsBuddyPrimary は、事業所が buddy を予定の正本にしているかを返す。
func (f Facility) IsBuddyPrimary() bool {
	return f.SourceMode == SourceBuddyPrimary
}
