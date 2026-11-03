package staff

import (
	"context"
	"slices"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、Usecase が使うリポジトリと、事業所の中の組織を読む小さなインターフェースである。
type Deps struct {
	Facilities  kernel.Finder[organization.Facility]
	Departments kernel.Finder[organization.Department]
	Teams       kernel.Finder[organization.Team]
	Positions   kernel.Finder[organization.Position]
	Policies    kernel.Finder[organization.Policy]
	Staff       Repository
	Identities  Identities
	Assignments AssignmentReader
	Calendars   CalendarDetacher
	// Self は、ctx のリクエストを送った職員の ID を返す。職員が自分を休職か退職にする操作を拒むのに使う。nil なら拒まない。
	Self func(ctx context.Context) (string, bool)
	// Now は、休職と退職で残る予定を数え始める日を決める時刻である。nil なら time.Now を使う。
	Now func() time.Time
}

// Usecase は、職員の操作である。職員の登録、休職、復職、退職と、職員の権限と役職を変える操作は、guard が許すときだけ行う（ADR-0006）。
// 職員の登録、休職、復職、退職は、ブローカーの職員も書く（ADR-0017、ADR-0018）。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *Usecase {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard}
}

// StatusChange は、休職か退職にした職員と、その日以降に残る予定と担当の利用者である。
type StatusChange struct {
	Staff       Detail
	Assignments Assignments
}

// remaining は、職員 cur の、今日（事業所の現地の日付）以降の予定、繰り返しの予定、担当の利用者を返す。
// 休職、退職、訪問しない職員への変更、RemainingAssignments が同じ一覧を返すよう、全てこれで作る。
func (s *Usecase) remaining(ctx context.Context, cur Detail) (Assignments, error) {
	return s.deps.Assignments.From(ctx, cur.FacilityID, cur.ID, civil.Today(s.deps.Now()))
}

// stop は、休職と退職に共通の確認をしてから、事業所をロックしたトランザクションの中で、読み直した職員で write を呼ぶ。
// 自分と、事業所で職員の管理の権限を持つ最後の有効な職員は、apperr.ErrConflict で拒む。
// 事業所のロックで、同じ事業所の休職と退職を 1 つずつにし、管理者どうしが同時に休職にし合って有効な管理者がいなくなるのを防ぐ。
func (s *Usecase) stop(ctx context.Context, id string, write func(ctx context.Context, cur Detail) error) error {
	if err := s.guard(ctx); err != nil {
		return err
	}
	if s.deps.Self != nil {
		if self, ok := s.deps.Self(ctx); ok && self == id {
			return apperr.Conflict("自分を休職か退職にすることはできません")
		}
	}
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.locked(ctx, id)
		if err != nil {
			return err
		}
		if err := s.lastManager(ctx, cur, "職員の管理の権限を持つ最後の有効な職員は、休職と退職にできません"); err != nil {
			return err
		}
		return write(ctx, cur)
	})
}

// locked は、トランザクションの中で職員 id の事業所をロックし、ロックの後に読み直した職員を返す。
// 休職、復職、退職、役職とチームを変える操作、権限を外す操作は、このロックで同じ事業所の中で 1 つずつ行う。
func (s *Usecase) locked(ctx context.Context, id string) (Detail, error) {
	st, err := s.deps.Staff.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := s.deps.Staff.LockFacility(ctx, st.FacilityID); err != nil {
		return Detail{}, err
	}
	return s.deps.Staff.Get(ctx, id)
}

// lastManager は、cur が事業所で職員の管理の権限を持つ最後の有効な職員なら、msg の apperr.ErrConflict を返す。
// 戻す操作をする職員がいなくなると、DB を直すほかに戻せないためである（ADR-0018）。呼び出し側は、事業所をロックしてから呼ぶ。
func (s *Usecase) lastManager(ctx context.Context, cur Detail, msg string) error {
	if cur.Status() != StatusActive || !slices.ContainsFunc(cur.Policies, func(g PolicyGrant) bool {
		return g.PolicyCode == organization.StaffManage
	}) {
		return nil
	}
	managers, err := s.deps.Staff.ActiveManagers(ctx, cur.FacilityID)
	if err != nil {
		return err
	}
	if !slices.ContainsFunc(managers, func(m string) bool { return m != cur.ID }) {
		return apperr.Conflict("%s", msg)
	}
	return nil
}

// AssignmentReader は、ほかの機能のデータから、職員に残る予定と担当の利用者を読む。
type AssignmentReader interface {
	// From は、事業所 facilityID の職員 staffID の、from 以降の予定と、from 以降に終わる繰り返しの予定と、担当の利用者を返す。
	From(ctx context.Context, facilityID, staffID string, from civil.Date) (Assignments, error)
}

// CalendarDetacher は、退職した職員の外部のカレンダーを外す。実装は postgres.CalendarRepository である。
type CalendarDetacher interface {
	// DetachByStaff は、職員 staffID の外していないカレンダーを外す。カレンダーのレコードと予定の対応は残す。
	// カレンダーが無ければ何もしない。
	DetachByStaff(ctx context.Context, staffID string) error
}

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
