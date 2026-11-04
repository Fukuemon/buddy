package organization

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// CreateTeam は、事業所にチームを作り、保存したチームを返す。
type CreateTeam struct {
	facilities FacilityRepository
	teams      TeamRepository
	ids        kernel.IDGenerator
	guard      Guard
}

// NewCreateTeam は CreateTeam を作る。
func NewCreateTeam(facilities FacilityRepository, teams TeamRepository, ids kernel.IDGenerator, guard Guard) CreateTeam {
	return CreateTeam{facilities: facilities, teams: teams, ids: ids, guard: guard}
}

// Do は、事業所にチームを作り、保存したチームを返す。color が空なら NextTeamColor で事業所のチームの色から選ぶ。
// 職員の管理の権限が無いときは apperr.ErrForbidden を、color が 8 色にないときは入力のエラーを、
// 同じ事業所に同じ名前のチームがあるときは apperr.ErrConflict を返す。
func (o CreateTeam) Do(ctx context.Context, facilityID, name string, color TeamColor) (Team, error) {
	if err := o.guard(ctx); err != nil {
		return Team{}, err
	}
	if _, err := o.facilities.Get(ctx, facilityID); err != nil {
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
	if err := o.teams.Create(ctx, t); err != nil {
		return Team{}, apperr.AsConflict(err, "チーム %s はこの事業所にすでにあります", t.Name)
	}
	return o.teams.Get(ctx, t.ID)
}

// teamColorOf は、color が空でなければそのまま返し、空なら事業所 facilityID のチームが使っていない色を NextTeamColor で選ぶ。
func (o CreateTeam) teamColorOf(ctx context.Context, facilityID string, color TeamColor) (TeamColor, error) {
	if color != "" {
		return color, nil
	}
	teams, err := o.teams.ListByFacility(ctx, facilityID)
	if err != nil {
		return "", err
	}
	used := make([]TeamColor, len(teams))
	for i, t := range teams {
		used[i] = t.Color
	}
	return NextTeamColor(used), nil
}
