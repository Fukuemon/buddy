// Package schedule は、職員の予定（単発、繰り返し、キャンセル）と予定の種類と、予定の操作を持つ。
package schedule

import (
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/kernel"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

const (
	maxTitleLen  = 255
	maxReasonLen = 255
	// overtimeStartHour 以降に始まる予定を時間外の勤務とする。
	overtimeStartHour = 17
)

// TypeName は、予定の種類の表示の名前である。一覧の絞り込みとレスポンスに使う。
type TypeName string

// 予定の種類の名前。
const (
	Normal TypeName = "通常"
	Visit  TypeName = "訪問"
)

// TypeCode は、予定の種類の識別子である。種類ごとの必須の項目は、名前ではなくこの値で決める。
type TypeCode string

// 予定の種類の識別子。
const (
	// CodeNormal の予定はタイトルを必須とする。
	CodeNormal TypeCode = "normal"
	// CodeVisit の予定は訪問の情報を必須とする。
	CodeVisit TypeCode = "visit"
)

// Type は、予定の種類である。
type Type struct {
	ID   string
	Code TypeCode
	Name TypeName
}

// Slot は、単発と繰り返しの予定が共通に持つ属性である。VisitInfoID、Title、Description は、ないときに nil である。
type Slot struct {
	FacilityID     string
	StaffID        string
	TypeID         string
	Date           civil.Date
	StartTime      civil.Time
	EndTime        civil.Time
	VisitInfoID    *string
	Title          *string
	Description    *string
	IsOverTimeWork bool
}

func newSlot(s Slot, typ Type) (Slot, error) {
	if s.Date.IsZero() {
		return Slot{}, apperr.Invalid("日付は必須です")
	}
	if !s.StartTime.Before(s.EndTime) {
		return Slot{}, apperr.Invalid("終了の時刻は開始の時刻より後にします")
	}
	if s.Title != nil {
		if err := kernel.RequireText("タイトル", *s.Title, maxTitleLen); err != nil {
			return Slot{}, err
		}
	}
	switch typ.Code {
	case CodeNormal:
		if s.Title == nil {
			return Slot{}, apperr.Invalid("通常の予定にはタイトルが必須です")
		}
		if s.VisitInfoID != nil {
			return Slot{}, apperr.Invalid("通常の予定には訪問の情報を付けられません")
		}
	case CodeVisit:
		if s.VisitInfoID == nil {
			return Slot{}, apperr.Invalid("訪問の予定には訪問の情報が必須です")
		}
	}
	s.TypeID = typ.ID
	s.IsOverTimeWork = s.StartTime.Hour >= overtimeStartHour
	return s, nil
}

// Schedule は、単発の予定である。RecurringScheduleID と OriginalDate は、繰り返しの予定の 1 回を置き換えた予定のときに、
// 元の繰り返しの予定と、置き換えた元の回の日付を指す。2 つは組で持ち、置き換えでない予定では両方とも nil である。
type Schedule struct {
	ID string
	Slot
	RecurringScheduleID *string
	OriginalDate        *civil.Date
}

// New は、種類ごとの必須の項目と時刻の前後を検証して Schedule を作る。IsOverTimeWork は開始の時刻から決める。
func New(id string, s Slot, typ Type) (Schedule, error) {
	slot, err := newSlot(s, typ)
	if err != nil {
		return Schedule{}, err
	}
	return Schedule{ID: id, Slot: slot}, nil
}

// Cancel は、予定のキャンセルである。
type Cancel struct {
	ID         string
	ScheduleID string
	Reason     string
}

// NewCancel は、理由を検証して Cancel を作る。
func NewCancel(id, scheduleID, reason string) (Cancel, error) {
	if err := kernel.RequireText("キャンセルの理由", reason, maxReasonLen); err != nil {
		return Cancel{}, err
	}
	return Cancel{ID: id, ScheduleID: scheduleID, Reason: reason}, nil
}

// Detail は、単発の予定と、種類、職員、訪問の情報、キャンセルの内容である。Visit と Cancel は、ないときに nil である。
// Version は更新の番号で、作ったときに 1 で、変えるかキャンセルするたびに 1 つ増える。
type Detail struct {
	Schedule
	TypeName  TypeName
	StaffName string
	Visit     *visit.Detail
	Cancel    *Cancel
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ParseSort は、予定の一覧の並べ替えを読む。カラムは date、start_time、created_at だけを受け付ける。
// date は日付の後に開始の時刻で並べる。カラムを指定しないときは日付の順にする。
func ParseSort(field, order string) (kernel.Sort, error) {
	return kernel.ParseSort(field, order,
		[]string{"date", "start_time", "created_at"},
		kernel.Sort{Field: "date"})
}

// ListQuery は、予定の一覧の絞り込みと並べ替えである。nil の絞り込みは使わない。
// DateFrom と DateTo は、両端を含む。繰り返しの予定には、日付の絞り込みを使わない。
type ListQuery struct {
	TypeName *TypeName
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
