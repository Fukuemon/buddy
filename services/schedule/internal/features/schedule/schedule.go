// Package schedule は、職員の予定（単発、繰り返し、キャンセル）と予定の種類と、予定の操作を持つ。
package schedule

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
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
// Date は開始の日である。EndsNextDay が true の予定は、Date の翌日の EndTime に終わる（ADR-0013）。
type Slot struct {
	FacilityID     string
	StaffID        string
	TypeID         string
	Date           civil.Date
	StartTime      civil.Time
	EndTime        civil.Time
	EndsNextDay    bool
	VisitInfoID    *string
	Title          *string
	Description    *string
	IsOverTimeWork bool
}

func newSlot(s Slot, typ Type) (Slot, error) {
	if s.Date.IsZero() {
		return Slot{}, apperr.Invalid("日付は必須です")
	}
	if err := validateTimes(s.StartTime, s.EndTime, s.EndsNextDay); err != nil {
		return Slot{}, err
	}
	if s.Title != nil {
		if err := kernel.ValidateText("タイトル", *s.Title, maxTitleLen); err != nil {
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
	s.IsOverTimeWork = IsOverTimeWork(s.StartTime)
	return s, nil
}

// IsOverTimeWork は、start に始まる予定が時間外の勤務（17 時以降に始まる予定）かを返す。
func IsOverTimeWork(start civil.Time) bool {
	return start.Hour >= overtimeStartHour
}

// validateTimes は、終了が翌日でない予定は終了の時刻が開始の時刻より後であることを、翌日の予定は前であることを確認する。
// 開始と終了の時刻が同じ予定は、24 時間になるので、どちらでも入力のエラーにする。
func validateTimes(start, end civil.Time, endsNextDay bool) error {
	switch {
	case start == end:
		return apperr.Invalid("開始と終了の時刻を同じにはできません")
	case endsNextDay && !end.Before(start):
		return apperr.Invalid("終了が翌日の予定は、終了の時刻を開始の時刻より前にします")
	case !endsNextDay && !start.Before(end):
		return apperr.Invalid("終了の時刻は開始の時刻より後にします。翌日に終わる予定は、終了が翌日であることを指定します")
	}
	return nil
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

// Cancellation は、予定のキャンセルである。
type Cancellation struct {
	ID         string
	ScheduleID string
	Reason     string
}

// NewCancellation は、理由を検証して Cancellation を作る。
func NewCancellation(id, scheduleID, reason string) (Cancellation, error) {
	if err := kernel.ValidateText("キャンセルの理由", reason, maxReasonLen); err != nil {
		return Cancellation{}, err
	}
	return Cancellation{ID: id, ScheduleID: scheduleID, Reason: reason}, nil
}

// Stored は、保存した単発の予定を、予定を書く前の確認に使う値と読んだものである。名前を結合しない（ADR-0008）。
// Visit は訪問の情報で、訪問の予定でなければ nil である。Cancelled は、キャンセル済みかである。
// Version は更新の番号で、作ったときに 1 で、変えるかキャンセルするたびに 1 つ増える。
type Stored struct {
	Schedule
	Visit     *visit.Info
	Cancelled bool
	Version   int
}
