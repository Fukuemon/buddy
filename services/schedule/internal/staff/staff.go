// Package staff は、事業所の職員と、職員に与えた権限と、職員の操作を持つ。
package staff

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
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
// LeaveStartedAt は休職にした時刻で、休職でなければ nil である。LeaveReturnDate は戻る予定の日のメモで、その日に自動では戻さない。
// RetiredAt は退職にした時刻で、退職していなければ nil である。退職した職員は、Email が空で、PhoneNumber が nil である（ADR-0018）。
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
// Status は、予定と担当の新しい割り振りの確認に使う。
type Ref struct {
	ID         string
	FacilityID string
	TeamID     string
	Status     Status
}

// Assignable は、職員に予定と担当を新しく割り振れるかを確認する。休職と退職の職員には割り振れず、入力のエラーを返す（ADR-0018）。
func (r Ref) Assignable() error {
	switch r.Status {
	case StatusOnLeave:
		return apperr.Invalid("休職の職員 %s には、予定と担当を割り振れません", r.ID)
	case StatusRetired:
		return apperr.Invalid("退職した職員 %s には、予定と担当を割り振れません", r.ID)
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
// StartLeave は、職員を休職にした時刻と戻る予定の日を書く。休職の職員を休職にし直しても、最初に休職にした時刻を残し、
// 戻る予定の日だけを書き換える。EndLeave は、休職を外す。Retire は、職員を退職にし、メールと電話番号を消す。
// 退職し直しても、最初に退職にした時刻を残す。StartLeave と EndLeave は、退職した職員では apperr.ErrConflict を返す。
//
// LockFacility は、トランザクションが終わるまで、事業所の職員の休職、退職、役職を変える操作、権限を外す操作と、予定と担当の新しい割り振りを、
// ほかのトランザクションに待たせる。
// ActiveManagers は、事業所で職員の管理の権限を持つ有効な職員の ID を返す。
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
	StartLeave(ctx context.Context, id string, returnDate *civil.Date) error
	EndLeave(ctx context.Context, id string) error
	Retire(ctx context.Context, id string) error
	LockFacility(ctx context.Context, facilityID string) error
	ActiveManagers(ctx context.Context, facilityID string) ([]string, error)
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

// Assignments は、職員を休職か退職にするときに残る、その日以降の予定、繰り返しの予定、担当の利用者である。
// 予定と繰り返しの予定は、職員が予定の職員、主訪問者、同行者のどれかのものである。キャンセルした予定は含めない。
type Assignments struct {
	Schedules []AssignedSchedule
	Recurring []AssignedRecurring
	Patients  []AssignedPatient
}

// Empty は、残る予定と担当の利用者が無いかを返す。
func (a Assignments) Empty() bool {
	return len(a.Schedules) == 0 && len(a.Recurring) == 0 && len(a.Patients) == 0
}

// AssignmentReader は、ほかの機能のデータから、職員に残る予定と担当の利用者を読む。
type AssignmentReader interface {
	// From は、事業所 facilityID の職員 staffID の、from 以降の予定と、from 以降に終わる繰り返しの予定と、担当の利用者を返す。
	From(ctx context.Context, facilityID, staffID string, from civil.Date) (Assignments, error)
}

// AssignedError は、予定か担当の利用者が残る職員を退職にしようとしたことを示す。
type AssignedError struct {
	Assignments Assignments
}

func (e *AssignedError) Error() string {
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

// Registration は、ブローカーに職員を登録した結果である。Pending は、ブローカーの職員が登録の途中で、まだログインできないことを示す。
type Registration struct {
	ID      string
	Created bool
	Pending bool
}

// Identities は、ブローカーの職員の身元を書く（ADR-0017）。約束は broker.Client と同じである。
type Identities interface {
	// Register は、組織 orgID にメール email（NormalizeEmail でそろえた値）の職員を登録の途中の状態で登録する。
	// 同じ組織に同じメールの職員がいれば、作らずにその職員を返す。その職員が止められていれば ErrIdentitySuspended を、
	// ほかの組織に同じメールの職員がいれば ErrEmailTaken を返す。
	Register(ctx context.Context, orgID, email string) (Registration, error)
	// Activate は、登録の途中の職員を有効にし、ログインできるようにする。有効な職員を有効にしても成功する。
	// 止めた職員なら ErrIdentitySuspended を返す。
	Activate(ctx context.Context, id string) error
	// Unregister は、登録の途中の職員を消す。予定の API の書き込みに失敗したときに、登録を戻すのに使う。
	// いないか、登録の途中でなければ、消さずに成功する。
	Unregister(ctx context.Context, id string) error
	// Suspend は、職員を止め（休職）、ログインのセッション、同意、refresh token を取り消す。止めた職員を止めても成功する。
	// いなければ apperr.ErrNotFound を、退職した職員なら ErrIdentityRetired を、止めたが取り消せなければ ErrRevokeFailed を返す。
	Suspend(ctx context.Context, id string) error
	// Resume は、止めた職員を有効に戻す（復職）。上流のアカウントの結び付けは残す。有効な職員を戻しても成功する。
	// いなければ apperr.ErrNotFound を、退職した職員なら ErrIdentityRetired を、止めていない職員なら apperr.ErrConflict を返す。
	Resume(ctx context.Context, id string) error
	// Retire は、職員を退職にしてメールと上流のアカウントを消し、ログインのセッション、同意、refresh token を取り消す。
	// 退職した職員を退職にしても成功する。いなければ apperr.ErrNotFound を、退職にしたが取り消せなければ ErrRevokeFailed を返す。
	Retire(ctx context.Context, id string) error
}
