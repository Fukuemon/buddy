package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// UpdateTeam は、チーム id の名前と色を変え、変えたチームを返す。
type UpdateTeam struct {
	teams TeamRepository
	guard Guard
}

// NewUpdateTeam は UpdateTeam を作る。
func NewUpdateTeam(teams TeamRepository, guard Guard) UpdateTeam {
	return UpdateTeam{teams: teams, guard: guard}
}

// Do は、チーム id の名前と色を変え、変えたチームを返す。職員の管理の権限が無いときは apperr.ErrForbidden を、
// 名前か色が不正なときは入力のエラーを、同じ事業所にほかの同じ名前のチームがあるときは apperr.ErrConflict を返す。
func (o UpdateTeam) Do(ctx context.Context, id, name string, color TeamColor) (Team, error) {
	if err := o.guard(ctx); err != nil {
		return Team{}, err
	}
	cur, err := o.teams.Get(ctx, id)
	if err != nil {
		return Team{}, err
	}
	t, err := NewTeam(cur.ID, cur.FacilityID, name, color)
	if err != nil {
		return Team{}, err
	}
	if err := o.teams.Update(ctx, t); err != nil {
		return Team{}, apperr.AsConflict(err, "チーム %s はこの事業所にすでにあります", t.Name)
	}
	return o.teams.Get(ctx, t.ID)
}
