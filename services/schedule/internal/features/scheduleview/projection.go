package scheduleview

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// ProjectionStatus は、Projection の予定の状態である。
type ProjectionStatus string

// ProjectionStatus の値。
const (
	ProjectionConfirmed ProjectionStatus = "confirmed"
	// ProjectionCancelled は、繰り返しの予定の取り消した回である。取り消した単発の予定と繰り返しの親は、行を消すので持たない。
	ProjectionCancelled ProjectionStatus = "cancelled"
)

// ProjectionTime は、Projection の予定の開始、終了、元の開始である。終日の予定は Date だけを、時刻のある予定は At だけを持つ。
// 取り消した回の開始と終了は、どちらも持たない。
type ProjectionTime struct {
	At   *time.Time
	Date *civil.Date
}

// Projection は、Google カレンダーを予定の正本にする事業所（google_primary）の、Google カレンダーの 1 つの予定の写しである（ADR-0035）。
// calendarsync の同期の処理だけが書き、scheduleview だけが読む。繰り返しの予定は展開せず、親の予定と例外の回を別の行に持つ。
// 説明、場所、参加者、作成者と主催者のメール、添付は持たない。タイトルは利用者名を含むが、表示と照合に要るので持つ。
type Projection struct {
	// ExternalCalendarID は、結び付けたカレンダー（calendar.ExternalCalendar）の ID である。EventID との組で 1 行に決まる。
	ExternalCalendarID string
	// EventID は、Google の予定の ID である。
	EventID string
	// FacilityID と StaffID は、写した時点のカレンダーの事業所と職員である。
	FacilityID string
	StaffID    string
	// RecurringEventID は、例外の回の親の予定の ID で、例外の回でなければ空である。
	RecurringEventID string
	// OriginalStart は、例外の回が元の規則で始まるはずだった日時である。
	OriginalStart ProjectionTime
	Status        ProjectionStatus
	Title         string
	Start         ProjectionTime
	End           ProjectionTime
	// TimeZone は、Google の予定の開始に付いた IANA のタイムゾーンの名前で、無ければ空である。繰り返しの規則はこの暦で数える。
	TimeZone string
	// Recurrence は、繰り返しの親の予定の RRULE、EXDATE、RDATE の行で、親でなければ空である。
	Recurrence []string
	ETag       string
	// GoogleUpdatedAt は、Google で予定を最後に変えた時刻で、Google が返さなければ nil である。
	GoogleUpdatedAt *time.Time
	// LastEndDate は、Asia/Tokyo で予定が終わる日で、繰り返しの予定は最後の回が終わる日、取り消した回は元の開始の日である。
	// 終わりの無い繰り返しと、規則から最後の回を決められない繰り返しでは nil である。保持する期間より前に終わった行を消すのに使う。
	LastEndDate *civil.Date
	// ProjectedAt は、同期が行を書いた時刻である。
	ProjectedAt time.Time
}
