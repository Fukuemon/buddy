// Package staff は、事業所の職員と、職員に与えた権限と、職員の操作を持つ。
package staff

import (
	"errors"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

const (
	maxUsernameLen = 128
	maxEmailLen    = 320
	maxPhoneDigits = 11
)

// Staff は、事業所の職員である。Sub は、登録のときにブローカーが発行した職員の ID で、access token の sub になる。
// ブローカーで職員を作る前に登録した職員では nil のことがある。PhoneNumber は、先頭に "+" を付けた数字の列である。
// LeaveStartedAt は休職にした時刻で、休職でなければ nil である。LeaveReturnDate は戻る予定の日のメモで、その日に自動では戻さない。
// RetiredAt は退職にした時刻で、退職していなければ nil である。退職した職員は、Email が空で、PhoneNumber が nil である（ADR-0018）。
// NonVisiting は訪問しない職員かで、true の職員は予定のカレンダーの職員の列と、予定と担当の候補に出ず、予定と担当を新しく割り振れない（ADR-0020）。
// ゼロ値を訪問する職員にするため、訪問するかの逆を持つ。
type Staff struct {
	ID              string
	Sub             *string
	Username        string
	Email           string
	PhoneNumber     *string
	FacilityID      string
	DepartmentID    string
	TeamID          string
	PositionID      string
	NonVisiting     bool
	LeaveStartedAt  *time.Time
	LeaveReturnDate *civil.Date
	RetiredAt       *time.Time
}

// Status は、職員が有効か、休職か、退職かである。
type Status string

// 職員の状態。有効な職員だけがログインでき、予定のカレンダーと予定の候補に出る。
const (
	StatusActive  Status = "active"
	StatusOnLeave Status = "on_leave"
	StatusRetired Status = "retired"
)

// Status は、職員の状態を返す。
func (s Staff) Status() Status {
	switch {
	case s.RetiredAt != nil:
		return StatusRetired
	case s.LeaveStartedAt != nil:
		return StatusOnLeave
	default:
		return StatusActive
	}
}

// RequireLeavable は、職員を休職にできるかを確認する。退職した職員は休職にできず、競合のエラーを返す（ADR-0018）。
func (s Staff) RequireLeavable() error {
	if s.Status() == StatusRetired {
		return apperr.Conflict("退職した職員は休職にできません")
	}
	return nil
}

// RequireReinstatable は、職員を復職できるかを確認する。退職した職員は復職できず、競合のエラーを返す（ADR-0018）。
func (s Staff) RequireReinstatable() error {
	if s.Status() == StatusRetired {
		return apperr.Conflict("退職した職員は復職できません")
	}
	return nil
}

// RequireProfileEditable は、職員の名前、電話番号、部署、チーム、訪問しない職員かを変えられるかを確認する。
// 退職した職員は変えられず、競合のエラーを返す（ADR-0018）。
func (s Staff) RequireProfileEditable() error {
	if s.Status() == StatusRetired {
		return apperr.Conflict("退職した職員は変えられません")
	}
	return nil
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
	NonVisiting  bool
}

// New は、名前、メール、電話番号を検証して Staff を作る。メールは小文字にそろえる。電話番号は数字だけを受け付け、先頭に "+" を付ける。
func New(p NewParams) (Staff, error) {
	p.Email = NormalizeEmail(p.Email)
	if err := kernel.ValidateText("職員の名前", p.Username, maxUsernameLen); err != nil {
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
		NonVisiting:  p.NonVisiting,
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

// Profile は、登録した後に変えられる職員の名前、電話番号、部署、チーム、訪問しない職員かである。PhoneNumber が nil なら電話番号を消す。
// メールはブローカーが持つので含めない（ADR-0001）。
type Profile struct {
	Username     string
	PhoneNumber  *string
	DepartmentID string
	TeamID       string
	NonVisiting  bool
}

// NewProfile は、New と同じ規則で名前と電話番号を検証し、電話番号の先頭に "+" を付けた Profile を返す。
func NewProfile(p Profile) (Profile, error) {
	if err := kernel.ValidateText("職員の名前", p.Username, maxUsernameLen); err != nil {
		return Profile{}, err
	}
	if p.PhoneNumber != nil {
		phone, err := normalizePhone(*p.PhoneNumber)
		if err != nil {
			return Profile{}, err
		}
		p.PhoneNumber = &phone
	}
	return p, nil
}

// NormalizeEmail は、メールを小文字にそろえる。職員のメールは、そろえた値で保存し、比べる。
func NormalizeEmail(email string) string {
	return strings.ToLower(email)
}

func validateEmail(email string) error {
	if err := kernel.ValidateText("メール", email, maxEmailLen); err != nil {
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
// Status と NonVisiting は、予定と担当の新しい割り振りの確認に使う。
type Ref struct {
	ID          string
	FacilityID  string
	TeamID      string
	Status      Status
	NonVisiting bool
}

// RequireAssignable は、職員に予定と担当を新しく割り振れるかを確認する。休職と退職の職員（ADR-0018）と、訪問しない職員（ADR-0020）には
// 割り振れず、入力のエラーを返す。
func (r Ref) RequireAssignable() error {
	switch r.Status {
	case StatusOnLeave:
		return apperr.Invalid("休職の職員 %s には、予定と担当を割り振れません", r.ID)
	case StatusRetired:
		return apperr.Invalid("退職した職員 %s には、予定と担当を割り振れません", r.ID)
	}
	if r.NonVisiting {
		return apperr.Invalid("訪問しない職員 %s には、予定と担当を割り振れません", r.ID)
	}
	return nil
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
		kernel.Sort{Field: "updated_at", Descending: true})
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

// AssignedSchedule は、職員に割り振った単発の予定である。
type AssignedSchedule struct {
	ID        string
	Date      civil.Date
	StartTime civil.Time
	EndTime   civil.Time
}

// AssignedRecurring は、職員に割り振った繰り返しの予定である。Date は最初の回の日付で、EndDate は終了日である。
type AssignedRecurring struct {
	ID        string
	Date      civil.Date
	EndDate   *civil.Date
	StartTime civil.Time
	EndTime   civil.Time
}

// AssignedPatient は、職員が主に担当する利用者である。
type AssignedPatient struct {
	ID   string
	Name string
}

// Assignments は、職員を休職、退職、訪問しない職員にするときに残る、その日以降の予定、繰り返しの予定、担当の利用者である。
// 予定と繰り返しの予定は、職員が予定の職員、主訪問者、同行者のどれかのものである。キャンセルした予定は含めない。
type Assignments struct {
	Schedules          []AssignedSchedule
	RecurringSchedules []AssignedRecurring
	Patients           []AssignedPatient
}

// IsEmpty は、残る予定と担当の利用者が無いかを返す。
func (a Assignments) IsEmpty() bool {
	return len(a.Schedules) == 0 && len(a.RecurringSchedules) == 0 && len(a.Patients) == 0
}

// AssignedError は、予定か担当の利用者が残る職員を、退職にするか、訪問しない職員にしようとしたことを示す。
// NonVisiting は、訪問しない職員にしようとしたときに true である。
type AssignedError struct {
	Assignments Assignments
	NonVisiting bool
}

func (e *AssignedError) Error() string {
	if e.NonVisiting {
		return "予定か担当の利用者が残る職員は、訪問しない職員にできません。別の職員に割り振り直してください"
	}
	return "予定か担当の利用者が残る職員は退職にできません。別の職員に割り振り直してください"
}

// Unwrap は、apperr.ErrConflict を返す。
func (e *AssignedError) Unwrap() error { return apperr.ErrConflict }

var (
	// ErrEmailTaken は、登録しようとしたメールの職員が、ブローカーでほかの事業所にいることを示す。
	ErrEmailTaken = errors.New("同じメールの職員がほかの事業所にいる")
	// ErrIdentitySuspended は、登録か有効化しようとしたブローカーの職員が止められている（休職している）ことを示す。
	ErrIdentitySuspended = errors.New("ブローカーの職員が止められている")
	// ErrIdentityRetired は、止めるか戻そうとしたブローカーの職員が退職していることを示す。
	ErrIdentityRetired = errors.New("ブローカーの職員が退職している")
	// ErrRevokeFailed は、ブローカーが職員を止めたが、ログインのセッションか同意を取り消せなかったことを示す。
	ErrRevokeFailed = errors.New("ブローカーが職員を止めたが、ログインのセッションか同意を取り消せなかった")
)
