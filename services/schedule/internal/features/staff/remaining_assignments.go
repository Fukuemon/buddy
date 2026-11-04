package staff

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// RemainingAssignments は、職員の、今日（事業所の現地の日付）以降の予定、繰り返しの予定、担当の利用者を返す。
type RemainingAssignments struct {
	staff       Repository
	assignments AssignmentReader
	now         func() time.Time
	guard       organization.Guard
}

// NewRemainingAssignments は RemainingAssignments を作る。now は、残る予定を数え始める日を決める時刻である。nil なら time.Now を使う。
func NewRemainingAssignments(staff Repository, assignments AssignmentReader, now func() time.Time, guard organization.Guard) RemainingAssignments {
	if now == nil {
		now = time.Now
	}
	return RemainingAssignments{staff: staff, assignments: assignments, now: now, guard: guard}
}

// Do は、職員の、今日（事業所の現地の日付）以降の予定、繰り返しの予定、担当の利用者を返す。何も書かない。
// 休職と退職を確定する前に、画面が残る一覧を示すのに使う。一覧は、休職と退職と同じ remaining で作る。
// 職員が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (s RemainingAssignments) Do(ctx context.Context, id string) (Assignments, error) {
	if err := s.guard(ctx); err != nil {
		return Assignments{}, err
	}
	cur, err := s.staff.Get(ctx, id)
	if err != nil {
		return Assignments{}, err
	}
	return remaining(ctx, s.assignments, s.now, cur)
}
