// Package organization は、事業所と、その中の部署、チーム、役職、権限を表す。
package organization

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
)

const maxNameLen = 255

// Facility は、訪問看護の事業所である。
type Facility struct {
	ID        string
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Department は、事業所の部署である。
type Department struct {
	ID         string
	FacilityID string
	Name       string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// Team は、事業所のチームである。
type Team struct {
	ID         string
	FacilityID string
	Name       string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// NewTeam は、名前を検証して Team を作る。
func NewTeam(id, facilityID, name string) (Team, error) {
	if err := domain.RequireText("チームの名前", name, maxNameLen); err != nil {
		return Team{}, err
	}
	return Team{ID: id, FacilityID: facilityID, Name: name}, nil
}

// Policy は、職員に与える権限である。
type Policy struct {
	ID        string
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// NewPolicy は、名前を検証して Policy を作る。
func NewPolicy(id, name string) (Policy, error) {
	if err := domain.RequireText("権限の名前", name, maxNameLen); err != nil {
		return Policy{}, err
	}
	return Policy{ID: id, Name: name}, nil
}

// Position は、事業所の役職である。Policies は、その役職の職員に既定で与える権限である。
type Position struct {
	ID         string
	FacilityID string
	Name       string
	Policies   []Policy
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// NewPosition は、名前と権限の重なりを検証して Position を作る。
func NewPosition(id, facilityID, name string, policies []Policy) (Position, error) {
	if err := domain.RequireText("役職の名前", name, maxNameLen); err != nil {
		return Position{}, err
	}
	seen := make(map[string]bool, len(policies))
	for _, p := range policies {
		if seen[p.ID] {
			return Position{}, domain.Invalid("権限 %s が重なっています", p.ID)
		}
		seen[p.ID] = true
	}
	return Position{ID: id, FacilityID: facilityID, Name: name, Policies: policies}, nil
}

// FacilityRepository は、事業所を読む。見つからないときは domain.ErrNotFound を返す。
type FacilityRepository interface {
	Get(ctx context.Context, id string) (Facility, error)
}

// DepartmentRepository は、部署を読む。見つからないときは domain.ErrNotFound を返す。
type DepartmentRepository interface {
	Get(ctx context.Context, id string) (Department, error)
	ListByFacility(ctx context.Context, facilityID string) ([]Department, error)
}

// TeamRepository は、チームを読み書きする。見つからないときは domain.ErrNotFound を、
// 同じ事業所に同じ名前があるときは domain.ErrConflict を返す。
type TeamRepository interface {
	Get(ctx context.Context, id string) (Team, error)
	ListByFacility(ctx context.Context, facilityID string) ([]Team, error)
	Create(ctx context.Context, t Team) error
}

// PositionRepository は、役職と既定の権限を読み書きする。見つからないときは domain.ErrNotFound を、
// 同じ事業所に同じ名前があるときは domain.ErrConflict を返す。
type PositionRepository interface {
	Get(ctx context.Context, id string) (Position, error)
	ListByFacility(ctx context.Context, facilityID string) ([]Position, error)
	Create(ctx context.Context, p Position) error
}

// PolicyRepository は、権限を読み書きする。見つからないときは domain.ErrNotFound を、
// 同じ名前があるときは domain.ErrConflict を返す。ListByIDs は、見つかったものだけを返す。
type PolicyRepository interface {
	Get(ctx context.Context, id string) (Policy, error)
	List(ctx context.Context) ([]Policy, error)
	ListByIDs(ctx context.Context, ids []string) ([]Policy, error)
	Create(ctx context.Context, p Policy) error
}
