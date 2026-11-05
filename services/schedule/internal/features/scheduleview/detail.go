package scheduleview

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Detail は、単発の予定と、種類、職員、訪問の情報の名前と、キャンセルの内容である。Visit と Cancel は、ないときに nil である。
// Version は更新の番号で、作ったときに 1 で、変えるかキャンセルするたびに 1 つ増える。
type Detail struct {
	schedule.Schedule
	TypeName  schedule.TypeName
	StaffName string
	Visit     *visit.Detail
	Cancel    *schedule.Cancellation
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
	// Source は予定の読み元で、buddy の予定のテーブルの予定では SourceBuddy である。
	Source Source
	// ReviewReason は、Projection の予定のうち、確認が必要な予定の理由で、ほかの予定では空である。
	ReviewReason ReviewReason
}

// Source は、予定の読み元である。
type Source string

// Source の値。
const (
	// SourceBuddy は、buddy の予定のテーブルの予定である。ゼロ値にし、リポジトリが値を入れなくてよいようにする。
	SourceBuddy Source = ""
	// SourceGoogleCalendar は、google_primary の事業所で、同期が写した Google カレンダーの予定（Projection）である。
	SourceGoogleCalendar Source = "google_calendar"
)

// ReviewReason は、Projection の予定を、buddy の予定に読み替えられなかった理由である。
type ReviewReason string

// ReviewReason の値。
const (
	// ReviewRecurrenceUnsupported は、buddy の繰り返しの規則に写せない繰り返しの予定である。回に展開せず、最初の回の 1 件で返す。
	ReviewRecurrenceUnsupported ReviewReason = "recurrence_unsupported"
	// ReviewPatientNotFound は、タイトルの利用者名の利用者がいない予定である。
	ReviewPatientNotFound ReviewReason = "patient_not_found"
	// ReviewPatientAmbiguous は、タイトルの利用者名の利用者が 2 人以上いる予定である。
	ReviewPatientAmbiguous ReviewReason = "patient_ambiguous"
	// ReviewServiceCodeNotFound は、タイトルのサービス内容が、サービスコードのマスタに無い予定である。
	ReviewServiceCodeNotFound ReviewReason = "service_code_not_found"
	// ReviewTitleUnreadable は、タイトルが空白だけか、訪問のタイトルを読めない予定である。
	ReviewTitleUnreadable ReviewReason = "title_unreadable"
)

// RecurringDetail は、繰り返しの予定と、種類、職員、訪問の情報の名前と、除外した日付である。Visit は、ないときに nil である。
// Version は更新の番号で、作ったときに 1 で、回を除外するたびに 1 つ増える。
type RecurringDetail struct {
	schedule.RecurringSchedule
	TypeName       schedule.TypeName
	StaffName      string
	Visit          *visit.Detail
	ExclusionDates []civil.Date
	Version        int
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// ParseSort は、予定の一覧の並べ替えを読む。カラムは date、start_time、created_at だけを受け付ける。
// date は日付の後に開始の時刻で並べる。カラムを指定しないときは日付の順にする。
func ParseSort(field, order string) (kernel.Sort, error) {
	return kernel.ParseSort(field, order,
		[]string{"date", "start_time", "created_at"},
		kernel.Sort{Field: "date"})
}

// ListQuery は、予定の一覧の絞り込みと並べ替えである。nil の絞り込みは使わない。
// DateFrom と DateTo は、予定の日付（開始の日）で両端を含む。DateFrom の前の日に始まり DateFrom に終わる予定も含む（ADR-0015）。
// 繰り返しの予定には、日付の絞り込みを使わない。
type ListQuery struct {
	TypeName *schedule.TypeName
	DateFrom *civil.Date
	DateTo   *civil.Date
	Sort     kernel.Sort
}

// Validate は、日付の範囲の前後を検証する。
func (q ListQuery) Validate() error {
	if q.DateFrom != nil && q.DateTo != nil && q.DateTo.Before(*q.DateFrom) {
		return apperr.Invalid("date_to は date_from 以降の日付にします")
	}
	return nil
}

// Listing は、事業所の単発の予定と繰り返しの予定と、事業所の予定の正本のモードと、カレンダーの同期の状況である。
// google_primary の事業所では、Projection の繰り返しの予定を回に展開して Schedules に入れ、RecurringSchedules は空である。
// CalendarSyncs は google_primary の事業所でだけ持ち、見てよい職員のカレンダーに限る。
type Listing struct {
	Schedules          []Detail
	RecurringSchedules []RecurringDetail
	SourceMode         organization.SourceMode
	CalendarSyncs      []CalendarSync
	// Cutover は、google_primary の事業所の open の切り替えで、無ければ nil である。画面は「切り替え中」を出す（ADR-0009）。
	Cutover *OpenCutover
}
