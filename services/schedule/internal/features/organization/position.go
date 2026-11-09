package organization

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Position は、事業所の役職である。Policies は、その役職の職員にデフォルトで与える権限である。
type Position struct {
	ID         string
	FacilityID string
	Name       string
	Policies   []Policy
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// NewPosition は、名前と権限の重なりを検証して Position を作る。
// 対象の職員を指定する権限は、職員にコピーするときに対象を決められないので、デフォルトの権限にできない。
func NewPosition(id, facilityID, name string, policies []Policy) (Position, error) {
	if err := kernel.ValidateText("役職の名前", name, maxNameLen); err != nil {
		return Position{}, err
	}
	seen := make(map[string]bool, len(policies))
	for _, p := range policies {
		if seen[p.ID] {
			return Position{}, apperr.Invalid("権限 %s が重なっています", p.ID)
		}
		if p.NeedsTarget && !p.Code.IsTeamTarget() {
			return Position{}, apperr.Invalid("権限 %s は対象の職員を指定するので、役職のデフォルトの権限にできません", p.ID)
		}
		seen[p.ID] = true
	}
	return Position{ID: id, FacilityID: facilityID, Name: name, Policies: policies}, nil
}
