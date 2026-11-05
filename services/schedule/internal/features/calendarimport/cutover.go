package calendarimport

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// 切り替えの衝突の原因の code。httpapi が 409 のレスポンスの code にする。
const (
	// CodeCutoverOpen は、事業所に open の切り替えがすでにあることを表す。
	CodeCutoverOpen = "cutover_open"
	// CodeCutoverNotGooglePrimary は、事業所が Google カレンダーを予定の正本にしていないので、切り替えを始められないことを表す。
	CodeCutoverNotGooglePrimary = "cutover_not_google_primary"
	// CodeCutoverSyncNotReady は、最後の同期が成功していないカレンダーがあるので、切り替えを始められないことを表す。
	CodeCutoverSyncNotReady = "cutover_sync_not_ready"
	// CodeCutoverNotOpen は、切り替えが open でない（完了したかやめた）ことを表す。
	CodeCutoverNotOpen = "cutover_not_open"
	// CodeCutoverIncomplete は、完了の確認を満たさない予定かカレンダーがあるので、完了できないことを表す。IncompleteError が持つ。
	CodeCutoverIncomplete = "cutover_incomplete"
)

// CutoverStatus は、切り替えの状態である。open から completed か canceled に移る。
type CutoverStatus string

// CutoverStatus の値。
const (
	CutoverOpen      CutoverStatus = "open"
	CutoverCompleted CutoverStatus = "completed"
	CutoverCanceled  CutoverStatus = "canceled"
)

// Cutover は、事業所の予定の正本を Google カレンダーから buddy に切り替える作業の記録（切り替え）である（ADR-0029）。
// 1 つの事業所に open の切り替えは 1 つまでである。
type Cutover struct {
	ID         string
	FacilityID string
	Status     CutoverStatus
	// RangeStart は、取り込みの期間の最初の日で、切り替えを始めた月の初日である。期間は終わりを持たない。
	RangeStart civil.Date
	StartedBy  string
	StartedAt  time.Time
	// FinishedAt は、完了したかやめた時刻で、open なら nil である。
	FinishedAt *time.Time
}

// Range は、切り替えの取り込みの期間である。RangeStart から先の全てで、終わりを持たない。
func (c Cutover) Range() Range { return Range{Start: c.RangeStart} }

// cutoverRangeStart は、時刻 now の Asia/Tokyo の月の初日を返す。切り替えの取り込みの期間の最初の日である。
func cutoverRangeStart(now time.Time) civil.Date {
	d := civil.Today(now)
	d.Day = 1
	return d
}

// CutoverSkip は、切り替えの取り込みで、確認が必要な予定に取り込まないを選んだ記録である。
// ExternalEventID は ReviewItem.ExternalEventID で、Revision は取り込み方を選んだときの ReviewItem.Revision である。
type CutoverSkip struct {
	CutoverID          string
	FacilityID         string
	ExternalCalendarID string
	ExternalEventID    string
	Revision           string
}

// CutoverCalendar は、切り替えの状況のうち、結び付けたカレンダー 1 つの、最後の切り替えの取り込みと同期の状況である。
type CutoverCalendar struct {
	Sync scheduleview.CalendarSync
	// LastImport は、この切り替えで最後に成功した取り込みで、取り込んでいなければ nil である。
	LastImport *calendar.ImportRun
}

// CutoverState は、事業所の切り替えの状況である。Cutover は open の切り替えで、無ければ nil である。
// Calendars は、事業所の外していないカレンダーの全てで、カレンダーの ID の順である。
type CutoverState struct {
	Cutover   *Cutover
	Calendars []CutoverCalendar
}

// UnmetReason は、切り替えの完了の確認を満たさない理由である。
type UnmetReason string

// UnmetReason の値。
const (
	// UnmetNotImported は、カレンダーをこの切り替えで取り込んでいないことを表す。
	UnmetNotImported UnmetReason = "not_imported"
	// UnmetSyncStale は、最後の取り込みの後に、カレンダーの同期が成功していないことを表す。
	UnmetSyncStale UnmetReason = "sync_stale"
	// UnmetEventNotImported は、取り込んでいない Google の予定（取り込んだ後に作った予定、取り消した回を含む）があることを表す。
	UnmetEventNotImported UnmetReason = "event_not_imported"
	// UnmetNeedsReview は、確認が必要な予定の取り込み方を決めていないか、決めた後に予定が変わったことを表す。
	// buddy の繰り返しの規則に写せない繰り返しの予定を含む。
	UnmetNeedsReview UnmetReason = "needs_review"
	// UnmetChanged は、取り込んだ後に Google で予定が変わった（予定の対応の etag と Google の etag が違う）ことを表す。
	UnmetChanged UnmetReason = "changed"
	// UnmetDeleted は、取り込んだ後に Google で予定が消えたことを表す。
	UnmetDeleted UnmetReason = "deleted"
)

// Unmet は、切り替えの完了の確認を満たさないカレンダーか予定である。
// カレンダーの理由（UnmetNotImported、UnmetSyncStale）では予定の項目を持たない。日時は、読めた予定でだけ持つ。
type Unmet struct {
	ExternalCalendarID string
	StaffID            string
	StaffName          string
	Reason             UnmetReason
	// ExternalEventID は、予定の理由のときの Google の予定の ID である。
	ExternalEventID string
	Date            *civil.Date
	StartTime       *civil.Time
	EndTime         *civil.Time
	EndsNextDay     bool
	// ReviewReason は、UnmetNeedsReview のときの、確認が必要な理由である。
	ReviewReason ReviewReason
}

// IncompleteError は、切り替えの完了の確認を満たさないカレンダーと予定があるので、完了しなかったことを表す。
// errors.Is では apperr.ErrConflict として扱われる。
type IncompleteError struct {
	Items []Unmet
}

func (e *IncompleteError) Error() string {
	return "完了の条件を満たさないカレンダーか予定があります。取り込み直してから、もう一度完了してください"
}

// Is は、target が apperr.ErrConflict のときに true を返す。
func (e *IncompleteError) Is(target error) bool { return target == apperr.ErrConflict }
