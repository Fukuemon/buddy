// Package patient は、事業所が訪問する利用者を表す。
package patient

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
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

// Patient は、利用者である。AssignedStaffID は担当の職員、ServiceCodeID は既定のサービスコードである。
type Patient struct {
	ID              string
	FacilityID      string
	Name            string
	PreferredTime   PreferredTime
	PreferredGender PreferredGender
	ServiceCodeID   string
	AssignedStaffID string
}

// New は、名前と希望の値を検証して Patient を作る。
func New(p Patient) (Patient, error) {
	if err := domain.RequireText("利用者の名前", p.Name, maxNameLen); err != nil {
		return Patient{}, err
	}
	if !p.PreferredTime.Valid() {
		return Patient{}, domain.Invalid("希望の時間帯は %s か %s です", Morning, Afternoon)
	}
	if !p.PreferredGender.Valid() {
		return Patient{}, domain.Invalid("希望の性別は %s か %s です", Male, Female)
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

// ParseSort は、利用者の一覧の並べ替えを読む。列は name、created_at だけを受け付ける。
// 列を指定しないときは名前の順にする。
func ParseSort(field, order string) (domain.Sort, error) {
	return domain.ParseSort(field, order,
		[]string{"name", "created_at"},
		domain.Sort{Field: "name"})
}

// ListQuery は、利用者の一覧の絞り込みと並べ替えである。nil の絞り込みは使わない。
// AssignedStaff は、担当の職員の名前で一致させる。
type ListQuery struct {
	Name            *string
	PreferredTime   *PreferredTime
	PreferredGender *PreferredGender
	AssignedStaff   *string
	Sort            domain.Sort
}

// Repository は、利用者を読み書きする。見つからないときは domain.ErrNotFound を返す。
type Repository interface {
	Create(ctx context.Context, p Patient) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Detail, error)
}
