// Package staff は、事業所の職員と、職員に与えた権限を表す。
package staff

import (
	"context"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
)

const (
	maxUsernameLen = 128
	maxEmailLen    = 320
	maxPhoneDigits = 11
)

// Staff は、事業所の職員である。Sub は、認証の基盤の利用者の識別子で、結び付ける前は nil である。
// PhoneNumber は、先頭に "+" を付けた数字の列である。
type Staff struct {
	ID           string
	Sub          *string
	Username     string
	Email        string
	PhoneNumber  *string
	FacilityID   string
	DepartmentID string
	TeamID       string
	PositionID   string
}

// NewParams は、New に渡す職員の属性である。
type NewParams struct {
	ID           string
	Username     string
	Email        string
	PhoneNumber  *string
	FacilityID   string
	DepartmentID string
	TeamID       string
	PositionID   string
}

// New は、名前、メール、電話番号を検証して Staff を作る。電話番号は数字だけを受け付け、先頭に "+" を付ける。
func New(p NewParams) (Staff, error) {
	if err := domain.RequireText("職員の名前", p.Username, maxUsernameLen); err != nil {
		return Staff{}, err
	}
	if err := validateEmail(p.Email); err != nil {
		return Staff{}, err
	}
	s := Staff{
		ID:           p.ID,
		Username:     p.Username,
		Email:        p.Email,
		FacilityID:   p.FacilityID,
		DepartmentID: p.DepartmentID,
		TeamID:       p.TeamID,
		PositionID:   p.PositionID,
	}
	if p.PhoneNumber != nil {
		phone, err := normalizePhone(*p.PhoneNumber)
		if err != nil {
			return Staff{}, err
		}
		s.PhoneNumber = &phone
	}
	return s, nil
}

func validateEmail(email string) error {
	if err := domain.RequireText("メール", email, maxEmailLen); err != nil {
		return err
	}
	local, host, ok := strings.Cut(email, "@")
	if !ok || local == "" || !strings.Contains(host, ".") || strings.ContainsAny(email, " \t") {
		return domain.Invalid("メールの形式が正しくありません")
	}
	return nil
}

func normalizePhone(phone string) (string, error) {
	digits := strings.TrimPrefix(phone, "+")
	if digits == "" || len(digits) > maxPhoneDigits {
		return "", domain.Invalid("電話番号は%d桁以内の数字です", maxPhoneDigits)
	}
	for _, c := range digits {
		if c < '0' || c > '9' {
			return "", domain.Invalid("電話番号は数字だけで書きます")
		}
	}
	return "+" + digits, nil
}

// Grant は、職員に与える 1 つの権限である。
type Grant struct {
	ID       string
	PolicyID string
}

// Summary は、職員と、所属の名前である。
type Summary struct {
	Staff
	DepartmentName string
	TeamName       string
	PositionName   string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// PolicyGrant は、職員が持つ権限と、その権限が及ぶ職員である。
type PolicyGrant struct {
	UserPolicyID  string
	PolicyID      string
	PolicyName    string
	TargetUserIDs []string
}

// Detail は、職員と、所属の名前と、持っている権限である。
type Detail struct {
	Summary
	Policies []PolicyGrant
}

// ParseSort は、職員の一覧の並べ替えを読む。列は username、created_at、updated_at だけを受け付ける。
// 列を指定しないときは更新の新しい順にする。
func ParseSort(field, order string) (domain.Sort, error) {
	return domain.ParseSort(field, order,
		[]string{"username", "created_at", "updated_at"},
		domain.Sort{Field: "updated_at", Desc: true})
}

// ListQuery は、職員の一覧の絞り込みと並べ替えである。nil の絞り込みは使わない。
// Position、Department、Team は、名前で一致させる。
type ListQuery struct {
	Username   *string
	Position   *string
	Department *string
	Team       *string
	Sort       domain.Sort
}

// Repository は、職員を読み書きする。見つからないときは domain.ErrNotFound を、
// 名前かメールか Sub が重なるときは domain.ErrConflict を返す。
//
// LinkSub は、事業所 facilityID の、メールが email で Sub がまだない職員にだけ sub を書く。
// 当たる職員がいなければ何もせず、エラーも返さない。
type Repository interface {
	Create(ctx context.Context, s Staff, grants []Grant) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Summary, error)
	FindIDBySub(ctx context.Context, sub string) (string, error)
	LinkSub(ctx context.Context, facilityID, email, sub string) error
}
