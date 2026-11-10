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

// StandardPosition は、事業所を足すときに作る標準の役職と、そのデフォルトの権限である（ADR-0007）。
// 名前は作った後に事業所ごとに変えてよく、判定は役職を使わない。
type StandardPosition struct {
	Name     string
	Policies []PolicyCode
}

// StandardPositions は、標準の 4 つの役職を、マネージャー、チームリーダー、メンバー、事務の順に返す。
// デフォルトの権限は PRD の役職ごとの権限の表のとおりで、先頭のマネージャーだけが職員の管理の権限を持つ。
func StandardPositions() []StandardPosition {
	return []StandardPosition{
		{Name: "マネージャー", Policies: []PolicyCode{ScheduleSelfEdit, ScheduleAllRead, ScheduleAllEdit, StaffManage, ReceiptCheck}},
		{Name: "チームリーダー", Policies: []PolicyCode{ScheduleSelfEdit, ScheduleTeamRead, ScheduleTeamEdit}},
		{Name: "メンバー", Policies: []PolicyCode{ScheduleSelfEdit}},
		{Name: "事務", Policies: []PolicyCode{ScheduleAllRead, ScheduleAllEdit, ReceiptCheck}},
	}
}
