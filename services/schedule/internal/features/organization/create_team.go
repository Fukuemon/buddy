package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
)

// CreateTeam は、事業所にチームを作り、保存したチームを返す。color が空なら NextTeamColor で事業所のチームの色から選ぶ。
// 職員の管理の権限が無いときは apperr.ErrForbidden を、color が 8 色にないときは入力のエラーを、
// 同じ事業所に同じ名前のチームがあるときは apperr.ErrConflict を返す。
func (o *Usecase) CreateTeam(ctx context.Context, facilityID, name string, color TeamColor) (Team, error) {
	if err := o.guard(ctx); err != nil {
		return Team{}, err
	}
	if _, err := o.deps.Facilities.Get(ctx, facilityID); err != nil {
		return Team{}, err
	}
	color, err := o.teamColorOf(ctx, facilityID, color)
	if err != nil {
		return Team{}, err
	}
	t, err := NewTeam(o.ids.NewID(), facilityID, name, color)
	if err != nil {
		return Team{}, err
	}
	if err := o.deps.Teams.Create(ctx, t); err != nil {
		return Team{}, apperr.AsConflict(err, "チーム %s はこの事業所にすでにあります", t.Name)
	}
	return o.deps.Teams.Get(ctx, t.ID)
}

// teamColorOf は、color が空でなければそのまま返し、空なら事業所 facilityID のチームが使っていない色を NextTeamColor で選ぶ。
func (o *Usecase) teamColorOf(ctx context.Context, facilityID string, color TeamColor) (TeamColor, error) {
	if color != "" {
		return color, nil
	}
	teams, err := o.deps.Teams.ListByFacility(ctx, facilityID)
	if err != nil {
		return "", err
	}
	used := make([]TeamColor, len(teams))
	for i, t := range teams {
		used[i] = t.Color
	}
	return NextTeamColor(used), nil
}
