// Package staff は、事業所の職員と、職員に与えた権限と、職員の操作を持つ。
package staff

import (
	"context"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
)

const (
	maxUsernameLen = 128
	maxEmailLen    = 320
	maxPhoneDigits = 11
)

// Staff は、事業所の職員である。Sub は、登録のときにブローカーが発行した職員の ID で、access token の sub になる。
// ブローカーで職員を作る前に登録した職員では nil のことがある。PhoneNumber は、先頭に "+" を付けた数字の列である。
// SuspendedAt は職員を止めた時刻で、止めていなければ nil である。
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
	SuspendedAt  *time.Time
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

// New は、名前、メール、電話番号を検証して Staff を作る。メールは小文字にそろえる。電話番号は数字だけを受け付け、先頭に "+" を付ける。
func New(p NewParams) (Staff, error) {
	p.Email = NormalizeEmail(p.Email)
	if err := kernel.RequireText("職員の名前", p.Username, maxUsernameLen); err != nil {
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

// NormalizeEmail は、メールを小文字にそろえる。職員のメールは、そろえた値で保存し、比べる。
func NormalizeEmail(email string) string {
	return strings.ToLower(email)
}

func validateEmail(email string) error {
	if err := kernel.RequireText("メール", email, maxEmailLen); err != nil {
		return err
	}
	local, host, ok := strings.Cut(email, "@")
	if !ok || local == "" || !strings.Contains(host, ".") || strings.ContainsAny(email, " \t") {
		return apperr.Invalid("メールの形式が正しくありません")
	}
	return nil
}

func normalizePhone(phone string) (string, error) {
	digits := strings.TrimPrefix(phone, "+")
	if digits == "" || len(digits) > maxPhoneDigits {
		return "", apperr.Invalid("電話番号は%d桁以内の数字です", maxPhoneDigits)
	}
	for _, c := range digits {
		if c < '0' || c > '9' {
			return "", apperr.Invalid("電話番号は数字だけで書きます")
		}
	}
	return "+" + digits, nil
}

// Ref は、ほかの機能が職員を参照するときに要る項目である。事業所とチームは、参照の確認と予定の権限の判定に使う。
type Ref struct {
	ID         string
	FacilityID string
	TeamID     string
}

// Grant は、職員に与える 1 つの権限と、その対象である。
type Grant struct {
	ID       string
	PolicyID string
	Targets  []Target
}

// Target は、権限が及ぶ職員かチームである。UserID と TeamID は、どちらか 1 つだけを持つ。
type Target struct {
	ID     string
	UserID string
	TeamID string
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

// PolicyGrant は、職員が持つ権限と、その権限が及ぶ職員とチームである。
type PolicyGrant struct {
	UserPolicyID  string
	PolicyID      string
	PolicyCode    organization.PolicyCode
	PolicyName    string
	TargetUserIDs []string
	TargetTeamIDs []string
}

// Detail は、職員と、所属の名前と、持っている権限である。
type Detail struct {
	Summary
	Policies []PolicyGrant
}

// ParseSort は、職員の一覧の並べ替えを読む。カラムは username、created_at、updated_at だけを受け付ける。
// カラムを指定しないときは更新の新しい順にする。
func ParseSort(field, order string) (kernel.Sort, error) {
	return kernel.ParseSort(field, order,
		[]string{"username", "created_at", "updated_at"},
		kernel.Sort{Field: "updated_at", Desc: true})
}

// ListQuery は、職員の一覧の絞り込みと並べ替えである。nil の絞り込みは使わない。
// Position、Department、Team は、名前で一致させる。
type ListQuery struct {
	Username   *string
	Position   *string
	Department *string
	Team       *string
	Sort       kernel.Sort
}

// Repository は、職員を読み書きする。見つからないときは apperr.ErrNotFound を、
// 同じ事業所にメールが重なる職員がいるか、Sub が重なるときは apperr.ErrConflict を返す。名前は重なってよい。
//
// FindIDBySub は、Sub が sub の職員の ID を返す。
//
// Suspend は、職員を止めた時刻を書く。止めた職員を止め直しても、最初に止めた時刻を残す。
//
// ChangePosition は、職員の役職を positionID にし、職員の権限と対象を全て消してから grants を書く。
//
// AddGrant は、職員に 1 つの権限と対象を書く。同じ権限が既にあるときは apperr.ErrConflict を返す。
// RemoveGrant は、職員の権限 userPolicyID と対象を消す。職員のその権限が無いときは apperr.ErrNotFound を返す。
type Repository interface {
	Create(ctx context.Context, s Staff, grants []Grant) error
	ChangePosition(ctx context.Context, id, positionID string, grants []Grant) error
	AddGrant(ctx context.Context, id string, g Grant) error
	RemoveGrant(ctx context.Context, id, userPolicyID string) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Summary, error)
	FindIDBySub(ctx context.Context, sub string) (string, error)
	Suspend(ctx context.Context, id string) error
}

// Identities は、ブローカーの職員の身元を書く（ADR-0017）。約束は broker.Client と同じである。
type Identities interface {
	// Register は、組織 orgID にメール email（NormalizeEmail でそろえた値）の職員を登録し、その ID と、新しく作ったかを返す。
	// 同じ組織に同じメールの職員がいれば、作らずにその ID と false を返す。その職員が止められていれば apperr.ErrConflict を返す。
	Register(ctx context.Context, orgID, email string) (id string, created bool, err error)
	// Unregister は、Register で作った職員を消す。予定の API の書き込みに失敗したときに、登録を戻すのに使う。
	Unregister(ctx context.Context, id string) error
	// Suspend は、職員を止め、ログインのセッション、同意、refresh token を取り消す。止めた職員を止めても成功する。
	Suspend(ctx context.Context, id string) error
}
