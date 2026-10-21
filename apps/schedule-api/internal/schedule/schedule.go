// Package schedule は、職員の予定（単発、繰り返し、キャンセル）と予定の種類と、予定の操作を持つ。
package schedule

import (
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

const (
	maxTitleLen  = 255
	maxReasonLen = 255
	// overtimeStartHour 以降に始まる予定を時間外の勤務とする。
	overtimeStartHour = 17
)

// TypeName は、予定の種類の名前である。種類ごとに必須の項目が変わる。
type TypeName string

// 予定の種類の名前。
const (
	// Normal の予定はタイトルを必須とする。
	Normal TypeName = "通常"
	// Visit の予定は訪問の情報を必須とする。
	Visit TypeName = "訪問"
)

// Type は、予定の種類である。
type Type struct {
	ID   string
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
		return Slot{}, domain.Invalid("日付は必須です")
	}
	if !s.StartTime.Before(s.EndTime) {
		return Slot{}, domain.Invalid("終了の時刻は開始の時刻より後にします")
	}
	if s.Title != nil {
		if err := domain.RequireText("タイトル", *s.Title, maxTitleLen); err != nil {
			return Slot{}, err
		}
	}
	switch typ.Name {
	case Normal:
		if s.Title == nil {
			return Slot{}, domain.Invalid("通常の予定にはタイトルが必須です")
		}
		if s.VisitInfoID != nil {
			return Slot{}, domain.Invalid("通常の予定には訪問の情報を付けられません")
		}
	case Visit:
		if s.VisitInfoID == nil {
			return Slot{}, domain.Invalid("訪問の予定には訪問の情報が必須です")
		}
	}
	s.TypeID = typ.ID
	s.IsOverTimeWork = s.StartTime.Hour >= overtimeStartHour
	return s, nil
}

// Schedule は、単発の予定である。RecurringScheduleID は、繰り返しの予定の 1 回を置き換えた予定のときに、元の繰り返しの予定を指す。
type Schedule struct {
	ID string
	Slot
	RecurringScheduleID *string
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
	if err := domain.RequireText("キャンセルの理由", reason, maxReasonLen); err != nil {
		return Cancel{}, err
	}
	return Cancel{ID: id, ScheduleID: scheduleID, Reason: reason}, nil
}

// Detail は、単発の予定と、種類、職員、訪問の情報、キャンセルの内容である。Visit と Cancel は、ないときに nil である。
type Detail struct {
	Schedule
	TypeName  TypeName
	StaffName string
	Visit     *visit.Detail
	Cancel    *Cancel
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ParseSort は、予定の一覧の並べ替えを読む。列は date、start_time、created_at だけを受け付ける。
// date は日付の後に開始の時刻で並べる。列を指定しないときは日付の順にする。
func ParseSort(field, order string) (domain.Sort, error) {
	return domain.ParseSort(field, order,
		[]string{"date", "start_time", "created_at"},
		domain.Sort{Field: "date"})
}

// ListQuery は、予定の一覧の絞り込みと並べ替えである。nil の絞り込みは使わない。
// DateFrom と DateTo は、両端を含む。繰り返しの予定には、日付の絞り込みを使わない。
type ListQuery struct {
	TypeName *TypeName
	DateFrom *civil.Date
	DateTo   *civil.Date
	Sort     domain.Sort
}

// Validate は、日付の範囲の前後を検証する。
func (q ListQuery) Validate() error {
	if q.DateFrom != nil && q.DateTo != nil && q.DateTo.Before(*q.DateFrom) {
		return domain.Invalid("date_to は date_from 以降の日付にします")
	}
	return nil
}
