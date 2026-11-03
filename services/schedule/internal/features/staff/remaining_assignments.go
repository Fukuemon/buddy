package staff

import "context"

// RemainingAssignments は、職員の、今日（事業所の現地の日付）以降の予定、繰り返しの予定、担当の利用者を返す。何も書かない。
// 休職と退職を確定する前に、画面が残る一覧を示すのに使う。一覧は、休職と退職と同じ remaining で作る。
// 職員が見つからないときは apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を返す。
func (s *App) RemainingAssignments(ctx context.Context, id string) (Assignments, error) {
	if err := s.guard(ctx); err != nil {
		return Assignments{}, err
	}
	cur, err := s.deps.Staff.Get(ctx, id)
	if err != nil {
		return Assignments{}, err
	}
	return s.remaining(ctx, cur)
}
