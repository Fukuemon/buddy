package staff

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// UpdateProfile は、職員の名前、電話番号、部署、チーム、訪問しない職員かを p にし、変えた職員を返す。メールは変えない（ADR-0017）。
// 訪問する職員を訪問しない職員に変えるときは、その日以降の予定、繰り返しの予定、担当の利用者が残れば、書かずに残る一覧を持つ
// *AssignedError を返す。一覧は退職と同じ remaining で作る（ADR-0022）。訪問しない職員を訪問する職員に戻すときは確認しない。
// チームを変えたときは、職員の権限のうち古いチームを指す対象を新しいチームに移し、ほかのチームの対象は残す。
// 登録と役職の変更で付けたチームの対象は所属のチームを指すが、予定の判定は保存した対象のチームだけを読むためである。
// 職員が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 退職した職員を変えようとしたときは apperr.ErrConflict を、部署かチームが見つからないか別の事業所のものであるときは入力のエラーを返す。
// 役職を変える操作と同じく事業所をロックし、読んだ古いチームが、書くまでにほかの操作で変わらないようにする。
// ロックは予定と担当の新しい割り振りも待たせるので、残る予定を数えてから書くまでに、訪問しない職員への割り振りが入らない。
func (s *Usecase) UpdateProfile(ctx context.Context, id string, p Profile) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.locked(ctx, id)
		if err != nil {
			return err
		}
		if err := cur.ProfileEditable(); err != nil {
			return err
		}
		dep, err := s.deps.Departments.Get(ctx, p.DepartmentID)
		if err != nil {
			return apperr.Reference("部署", p.DepartmentID, err)
		}
		if err := apperr.SameFacility("部署", dep.ID, dep.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		team, err := s.deps.Teams.Get(ctx, p.TeamID)
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
			a, err := s.remaining(ctx, cur)
			if err != nil {
				return err
			}
			if !a.Empty() {
				return &AssignedError{Assignments: a, NonVisiting: true}
			}
		}
		if err := s.deps.Staff.UpdateProfile(ctx, cur.ID, p, cur.TeamID); err != nil {
			return apperr.AsConflict(err, "退職した職員は変えられません")
		}
		changed, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}
