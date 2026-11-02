// Package patient は、事業所が訪問する利用者と、利用者の操作を持つ。
package patient

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

const maxNameLen = 255

// PreferredTime は、利用者が希望する訪問の時間帯である。
type PreferredTime string

// PreferredTime の値。
const (
	Morning   PreferredTime = "午前"
	Afternoon PreferredTime = "午後"
)

// Valid は、t が定義された値かを返す。
func (t PreferredTime) Valid() bool { return t == Morning || t == Afternoon }

// PreferredGender は、利用者が希望する訪問者の性別である。
type PreferredGender string

// PreferredGender の値。
const (
	Male   PreferredGender = "男性"
	Female PreferredGender = "女性"
)

// Valid は、g が定義された値かを返す。
func (g PreferredGender) Valid() bool { return g == Male || g == Female }

// Patient は、利用者である。AssignedStaffID は担当の職員、ServiceCodeID はデフォルトのサービスコードである。
// EndedAt は利用の終了にした時刻で、利用中なら nil である（ADR-0021）。
type Patient struct {
	ID              string
	FacilityID      string
	Name            string
	PreferredTime   PreferredTime
	PreferredGender PreferredGender
	ServiceCodeID   string
	AssignedStaffID string
	EndedAt         *time.Time
}

// Ended は、利用者が利用の終了かを返す。
func (p Patient) Ended() bool { return p.EndedAt != nil }

// New は、名前と希望の値を検証して Patient を作る。
func New(p Patient) (Patient, error) {
	if err := kernel.RequireText("利用者の名前", p.Name, maxNameLen); err != nil {
		return Patient{}, err
	}
	if !p.PreferredTime.Valid() {
		return Patient{}, apperr.Invalid("希望の時間帯は %s か %s です", Morning, Afternoon)
	}
	if !p.PreferredGender.Valid() {
		return Patient{}, apperr.Invalid("希望の性別は %s か %s です", Male, Female)
	}
	return p, nil
}

// Detail は、利用者と、サービスコードと担当の職員の名前である。
type Detail struct {
	Patient
	ServiceCode       string
	AssignedStaffName string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// ParseSort は、利用者の一覧の並べ替えを読む。カラムは name、created_at だけを受け付ける。
// カラムを指定しないときは名前の順にする。
func ParseSort(field, order string) (kernel.Sort, error) {
	return kernel.ParseSort(field, order,
		[]string{"name", "created_at"},
		kernel.Sort{Field: "name"})
}

// ListQuery は、利用者の一覧の絞り込みと並べ替えである。nil の絞り込みは使わない。
// AssignedStaff は、担当の職員の名前で一致させる。IncludeEnded が false なら、利用の終了の利用者を除く。
type ListQuery struct {
	Name            *string
	PreferredTime   *PreferredTime
	PreferredGender *PreferredGender
	AssignedStaff   *string
	IncludeEnded    bool
	Sort            kernel.Sort
}

// Repository は、利用者を読み書きする。見つからないときは apperr.ErrNotFound を返す。
//
// Update は、利用者の名前、希望、サービスコード、担当の職員を書き換える。利用の終了は変えない。
// End は、利用者を利用の終了にする。利用の終了の利用者を利用の終了にし直しても、最初に利用の終了にした時刻を残す。
// Resume は、利用者を利用中に戻し、担当の職員を assignedStaffID にする。
type Repository interface {
	Create(ctx context.Context, p Patient) error
	Update(ctx context.Context, p Patient) error
	End(ctx context.Context, id string) error
	Resume(ctx context.Context, id, assignedStaffID string) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error)
}

// RemainingSchedule は、利用者の単発の予定である。
type RemainingSchedule struct {
	ID        string
	Date      civil.Date
	StartTime civil.Time
	EndTime   civil.Time
}

// RemainingRecurring は、利用者の繰り返しの予定である。Date は最初の回の日付で、EndDate は終了日である。
type RemainingRecurring struct {
	ID        string
	Date      civil.Date
	EndDate   *civil.Date
	StartTime civil.Time
	EndTime   civil.Time
}

// Remaining は、利用者を利用の終了にするときに残る、その日以降の予定と繰り返しの予定である。
// 訪問の情報の利用者がその利用者の予定で、キャンセルした予定は含めない。
type Remaining struct {
	Schedules []RemainingSchedule
	Recurring []RemainingRecurring
}

// Empty は、残る予定が無いかを返す。
func (r Remaining) Empty() bool { return len(r.Schedules) == 0 && len(r.Recurring) == 0 }

// ScheduleReader は、予定のデータから、利用者に残る予定を読む。
type ScheduleReader interface {
	// From は、事業所 facilityID の利用者 patientID の、from 以降の予定と、from 以降に終わる繰り返しの予定を返す。
	From(ctx context.Context, facilityID, patientID string, from civil.Date) (Remaining, error)
}

// ScheduledError は、その日以降の予定が残る利用者を利用の終了にしようとしたことを示す。
type ScheduledError struct {
	Remaining Remaining
}

func (e *ScheduledError) Error() string {
	return "その日以降の予定か繰り返しの予定が残る利用者は、利用の終了にできません。予定をキャンセルするか、繰り返しを終えてください"
}

// Unwrap は、apperr.ErrConflict を返す。
func (e *ScheduledError) Unwrap() error { return apperr.ErrConflict }

// Getter は、利用者を 1 人読む。Repository の一部である。
type Getter interface {
	Get(ctx context.Context, id string) (Detail, error)
}

// VisitFinder は、訪問の情報が参照する利用者を r から探す visit.PatientFinder を返す。
func VisitFinder(r Getter) visit.PatientFinder {
	return func(ctx context.Context, id string) (visit.PatientRef, error) {
		p, err := r.Get(ctx, id)
		if err != nil {
			return visit.PatientRef{}, err
		}
		return visit.PatientRef{ID: p.ID, FacilityID: p.FacilityID, Ended: p.Ended()}, nil
	}
}
