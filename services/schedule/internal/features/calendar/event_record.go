package calendar

import (
	"context"
	"errors"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// EventRecord は、google_primary の事業所で予定の API が Google カレンダーに書いた 1 つの予定の、訪問の情報と書き込みの保留の版である
// （ADR-0026）。予定の API の書き込み（calendarwrite）が作り、同期（calendarsync）が保留の版を確定するか消す。
// ScheduleID は buddy の予定の ID で、Google の予定の ID（ExternalEventID）はこの ID から EventIDOf で決める。
// 通常の予定も、保留の版を持つために記録を作り、VisitInfoID は nil である。
// Google で作った予定を buddy で変えたときは、ScheduleID はその予定の一覧での ID（scheduleview.ProjectedScheduleID）で、
// ExternalEventID は Google が決めた ID である。主訪問者を替えて予定を別のカレンダーに移すと、ExternalCalendarID と ExternalEventID が変わる。
type EventRecord struct {
	ScheduleID         string
	FacilityID         string
	ExternalCalendarID string
	ExternalEventID    string
	// VisitInfoID は、Google が受けた版の訪問の情報である。通常の予定と、Version が 0 の記録では nil である。
	VisitInfoID *string
	// Version は、Google が受けたと分かった最後の版である。0 は、まだ受けたと分かっていないことを表し、Pending を持つ。
	Version int
	// Pending は、書き込みの保留の版で、無ければ nil である。
	Pending *PendingWrite
}

// PendingWrite は、Google に書いている途中か、Google が受けたかが分からない書き込みの版である。Version は EventRecord の Version より大きい。
// 版は Google の予定の extendedProperties.private の PropVersion に置き、Google が受けた版を見分ける。
type PendingWrite struct {
	Version int
	State   PendingState
	// VisitInfoID は、この版の訪問の情報である。通常の予定では nil である。
	VisitInfoID *string
	// Deadline は、書く期限である。
	Deadline time.Time
	// MoveTo は、予定を別のカレンダーに移す書き込みの、移す先である。移さない書き込みでは nil である。
	// 版を確定すると、記録のカレンダーと Google の予定の ID を移す先にする。
	MoveTo *EventLocation
}

// EventLocation は、Google の予定の場所で、結び付けたカレンダーの ID と Google の予定の ID の組である。
type EventLocation struct {
	ExternalCalendarID string
	ExternalEventID    string
}

// Location は、記録が指す、Google が受けたと分かった版の予定の場所を返す。
func (r EventRecord) Location() EventLocation {
	return EventLocation{ExternalCalendarID: r.ExternalCalendarID, ExternalEventID: r.ExternalEventID}
}

// PendingLocation は、保留の版を書く予定の場所を返す。移す書き込みでは移す先で、ほかは Location と同じである。
// 保留の版が無ければ Location を返す。
func (r EventRecord) PendingLocation() EventLocation {
	if r.Pending != nil && r.Pending.MoveTo != nil {
		return *r.Pending.MoveTo
	}
	return r.Location()
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
func (p PendingWrite) IsWriting(now time.Time) bool {
	return p.State == PendingWriting && now.Before(p.Deadline)
}

// EventRecords は、記録の保留の版を確定するか消すために、記録を読み書きする。実装は postgres.CalendarEventRecordRepository である。
// どのメソッドもトランザクションの中で呼ぶ。
type EventRecords interface {
	// GetForUpdate は、予定 scheduleID の記録を、トランザクションが終わるまでほかの書き込みを待たせるロックを取って返す。
	// 無いときは apperr.ErrNotFound を返す。
	GetForUpdate(ctx context.Context, scheduleID string) (EventRecord, error)
	// Update は、記録 r の訪問の情報、版、保留の版を r の値にする。
	Update(ctx context.Context, r EventRecord) error
	// Delete は、予定 scheduleID の記録を消す。無くてもエラーにしない。
	Delete(ctx context.Context, scheduleID string) error
}

// UnusedVisits は、使われなくなった訪問の情報を消す。実装は visit.Writer である。
type UnusedVisits interface {
	// DeleteIfUnused は、予定、繰り返しの予定、記録のどれも指していない訪問の情報 id を消す。指されているか、無いときは何もしない。
	DeleteIfUnused(ctx context.Context, id string) error
}

// LockPending は、予定 scheduleID の記録を排他のロックで読み、版が version の保留の版を持つときだけ ok を true にして返す。
// 記録が無いか、保留の版がほかの手順で解かれていれば、ok を false にする。トランザクションの中で呼ぶ。
func LockPending(ctx context.Context, records EventRecords, scheduleID string, version int) (EventRecord, bool, error) {
	rec, err := records.GetForUpdate(ctx, scheduleID)
	if errors.Is(err, apperr.ErrNotFound) {
		return EventRecord{}, false, nil
	}
	if err != nil {
		return EventRecord{}, false, err
	}
	return rec, rec.Pending != nil && rec.Pending.Version == version, nil
}

// ConfirmPending は、LockPending で読んだ記録 rec の保留の版を確定する。保留の訪問の情報を確定した訪問の情報に移し、
// 前の訪問の情報を、使われていなければ消す。予定を移す書き込みでは、記録のカレンダーと Google の予定の ID を移す先にする。
// トランザクションの中で呼ぶ。
func ConfirmPending(ctx context.Context, records EventRecords, visits UnusedVisits, rec EventRecord) error {
	prev := rec.VisitInfoID
	to := rec.PendingLocation()
	rec.ExternalCalendarID, rec.ExternalEventID = to.ExternalCalendarID, to.ExternalEventID
	rec.Version, rec.VisitInfoID, rec.Pending = rec.Pending.Version, rec.Pending.VisitInfoID, nil
	if err := records.Update(ctx, rec); err != nil {
		return err
	}
	return deleteUnusedVisit(ctx, visits, prev)
}

// RejectPending は、LockPending で読んだ記録 rec の保留の版を消し、保留の訪問の情報を、使われていなければ消す。
// 確定した版の無い記録は、作成を Google が受けていないので記録ごと消す。トランザクションの中で呼ぶ。
func RejectPending(ctx context.Context, records EventRecords, visits UnusedVisits, rec EventRecord) error {
	pendingVisit := rec.Pending.VisitInfoID
	var err error
	if rec.Version == 0 {
		err = records.Delete(ctx, rec.ScheduleID)
	} else {
		rec.Pending = nil
		err = records.Update(ctx, rec)
	}
	if err != nil {
		return err
	}
	return deleteUnusedVisit(ctx, visits, pendingVisit)
}

func deleteUnusedVisit(ctx context.Context, visits UnusedVisits, id *string) error {
	if id == nil {
		return nil
	}
	return visits.DeleteIfUnused(ctx, *id)
}
