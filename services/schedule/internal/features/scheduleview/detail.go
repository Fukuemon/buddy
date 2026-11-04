package scheduleview

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
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
}

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
// DateFrom と DateTo は、予定の日付（開始の日）で両端を含む。DateFrom の前の日に始まり DateFrom に終わる予定も含む（ADR-0023）。
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

// Listing は、事業所の単発の予定と繰り返しの予定である。
type Listing struct {
	Schedules          []Detail
	RecurringSchedules []RecurringDetail
}
