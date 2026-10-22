package staff

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
)

// DefaultGrants は、役職 pos のデフォルトの権限から、チーム teamID に所属する職員に与える権限を作る。権限と対象の ID は ids で発行する。
// ADR-0002 のとおり、チームを対象にする権限は、職員の所属のチームを対象にする。
func DefaultGrants(pos organization.Position, teamID string, ids kernel.IDGenerator) []Grant {
	grants := make([]Grant, 0, len(pos.Policies))
	for _, p := range pos.Policies {
		g := Grant{ID: ids.NewID(), PolicyID: p.ID}
		if p.Code.TargetsTeam() {
			g.Targets = []Target{{ID: ids.NewID(), TeamID: teamID}}
		}
		grants = append(grants, g)
	}
	return grants
}
