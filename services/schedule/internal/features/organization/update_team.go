package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// UpdateTeam は、チーム id の名前と色を変え、変えたチームを返す。職員の管理の権限が無いときは apperr.ErrForbidden を、
// 名前か色が不正なときは入力のエラーを、同じ事業所にほかの同じ名前のチームがあるときは apperr.ErrConflict を返す。
func (o *App) UpdateTeam(ctx context.Context, id, name string, color TeamColor) (Team, error) {
	if err := o.guard(ctx); err != nil {
		return Team{}, err
	}
	cur, err := o.deps.Teams.Get(ctx, id)
	if err != nil {
		return Team{}, err
	}
	t, err := NewTeam(cur.ID, cur.FacilityID, name, color)
	if err != nil {
		return Team{}, err
	}
	if err := o.deps.Teams.Update(ctx, t); err != nil {
		return Team{}, apperr.AsConflict(err, "チーム %s はこの事業所にすでにあります", t.Name)
	}
	return o.deps.Teams.Get(ctx, t.ID)
}
