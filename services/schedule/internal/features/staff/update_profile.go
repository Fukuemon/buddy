package staff

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// UpdateProfile は、職員の名前、電話番号、部署、チーム、訪問しない職員かを p にし、変えた職員を返す。
type UpdateProfile struct {
	staff       Repository
	locks       FacilityLock
	departments kernel.Finder[organization.Department]
	teams       kernel.Finder[organization.Team]
	assignments AssignmentReader
	now         func() time.Time
	tx          tx.Transactor
	guard       organization.Guard
}

// NewUpdateProfile は UpdateProfile を作る。now は、残る予定を数え始める日を決める時刻である。nil なら time.Now を使う。
func NewUpdateProfile(staff Repository, locks FacilityLock, departments kernel.Finder[organization.Department], teams kernel.Finder[organization.Team], assignments AssignmentReader, now func() time.Time, tx tx.Transactor, guard organization.Guard) UpdateProfile {
	if now == nil {
		now = time.Now
	}
	return UpdateProfile{staff: staff, locks: locks, departments: departments, teams: teams, assignments: assignments, now: now, tx: tx, guard: guard}
}

// Do は、職員の名前、電話番号、部署、チーム、訪問しない職員かを p にし、変えた職員を返す。メールは変えない（ADR-0017）。
// 訪問する職員を訪問しない職員に変えるときは、その日以降の予定、繰り返しの予定、担当の利用者が残れば、書かずに残る一覧を持つ
// *AssignedError を返す。一覧は退職と同じ remaining で作る（ADR-0022）。訪問しない職員を訪問する職員に戻すときは確認しない。
// チームを変えたときは、職員の権限のうち古いチームを指す対象を新しいチームに移し、ほかのチームの対象は残す。
// 登録と役職の変更で付けたチームの対象は所属のチームを指すが、予定の判定は保存した対象のチームだけを読むためである。
// 職員が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 退職した職員を変えようとしたときは apperr.ErrConflict を、部署かチームが見つからないか別の事業所のものであるときは入力のエラーを返す。
// 役職を変える操作と同じく事業所をロックし、読んだ古いチームが、書くまでにほかの操作で変わらないようにする。
// ロックは予定と担当の新しい割り振りも待たせるので、残る予定を数えてから書くまでに、訪問しない職員への割り振りが入らない。
func (s UpdateProfile) Do(ctx context.Context, id string, p Profile) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := locked(ctx, s.staff, s.locks, id)
		if err != nil {
			return err
		}
		if err := cur.RequireProfileEditable(); err != nil {
			return err
		}
		dep, err := s.departments.Get(ctx, p.DepartmentID)
		if err != nil {
			return apperr.Reference("部署", p.DepartmentID, err)
		}
		if err := apperr.SameFacility("部署", dep.ID, dep.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		team, err := s.teams.Get(ctx, p.TeamID)
		if err != nil {
			return apperr.Reference("チーム", p.TeamID, err)
		}
		if err := apperr.SameFacility("チーム", team.ID, team.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		p, err := NewProfile(p)
		if err != nil {
			return err
		}
		if !cur.NonVisiting && p.NonVisiting {
			a, err := remaining(ctx, s.assignments, s.now, cur)
			if err != nil {
				return err
			}
			if !a.IsEmpty() {
				return &AssignedError{Assignments: a, NonVisiting: true}
			}
		}
		if err := s.staff.UpdateProfile(ctx, cur.ID, p, cur.TeamID); err != nil {
			return apperr.AsConflict(err, "退職した職員は変えられません")
		}
		changed, err = s.staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}
