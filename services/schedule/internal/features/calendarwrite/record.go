package calendarwrite

import "time"

// Record は、google_primary の事業所で予定の API が Google カレンダーに書いた 1 つの予定の、訪問の情報と書き込みの保留の版である。
// ScheduleID は buddy の予定の ID で、Google の予定の ID（ExternalEventID）はこの ID から calendar.EventIDOf で決める。
// 通常の予定も、保留の版を持つために記録を作り、VisitInfoID は nil である。
type Record struct {
	ScheduleID         string
	FacilityID         string
	ExternalCalendarID string
	ExternalEventID    string
	// VisitInfoID は、Google が受けた版の訪問の情報である。通常の予定と、Version が 0 の記録では nil である。
	VisitInfoID *string
	// Version は、Google が受けたと分かった最後の版である。0 は、まだ受けたと分かっていないことを表し、Pending を持つ。
	Version int
	// Pending は、書き込みの保留の版で、無ければ nil である。
	Pending *Pending
}

// Pending は、Google に書いている途中か、Google が受けたかが分からない書き込みの版である。Version は Record の Version より大きい。
// 版は Google の予定の extendedProperties.private の calendar.PropVersion に置き、Google が受けた版を見分ける。
type Pending struct {
	Version int
	State   PendingState
	// VisitInfoID は、この版の訪問の情報である。通常の予定では nil である。
	VisitInfoID *string
	// Deadline は、書く期限である。保留の版を書いた時刻に WriteDeadline を足す。
	Deadline time.Time
}

// PendingState は、保留の版の状態である。
type PendingState string

// PendingState の値。
const (
	// PendingWriting は、予定の API が Google に書いている途中である。
	PendingWriting PendingState = "writing"
	// PendingUnknown は、Google が書き込みを受けたかが分からない（5xx、通信のエラー、時間切れ）。
	PendingUnknown PendingState = "unknown"
)

// IsWriting は、保留の版が、時刻 now の時点で書いている途中で、書く期限を過ぎていないかを返す。
// 期限を過ぎた「書いている途中」の版は、予定の API が止まったものとみなし、結果が分からない版と同じく扱う。
func (p Pending) IsWriting(now time.Time) bool {
	return p.State == PendingWriting && now.Before(p.Deadline)
}
