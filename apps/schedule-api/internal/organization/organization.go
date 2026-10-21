// Package organization は、事業所と、その中の部署、チーム、役職、権限と、それらの操作を持つ。
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

// PolicyCode は、認可が読む権限の識別子である。権限の行はマイグレーションが入れ、全ての環境で同じである。
type PolicyCode string

// 予定の権限である。編集の権限は、同じ範囲の閲覧を含む。
const (
	ScheduleSelfEdit PolicyCode = "schedule.self.edit"
	ScheduleUserRead PolicyCode = "schedule.user.read"
	ScheduleUserEdit PolicyCode = "schedule.user.edit"
	ScheduleTeamRead PolicyCode = "schedule.team.read"
	ScheduleTeamEdit PolicyCode = "schedule.team.edit"
	ScheduleAllRead  PolicyCode = "schedule.all.read"
	ScheduleAllEdit  PolicyCode = "schedule.all.edit"
)

// StaffManage は、職員の権限を足し外し、役職を変える権限である（ADR-0006）。予定の範囲には及ばない。
const StaffManage PolicyCode = "staff.manage"

// TargetsTeam は、権限の対象がチームであるかを返す。
func (c PolicyCode) TargetsTeam() bool {
	return c == ScheduleTeamRead || c == ScheduleTeamEdit
}

// Policy は、職員に与える権限である。NeedsTarget が true の権限は、対象の職員かチームを指定して与える。
type Policy struct {
	ID          string
	Code        PolicyCode
	Name        string
	NeedsTarget bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
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
// 対象の職員を指定する権限は、職員に写すときに対象を決められないので、既定にできない。
func NewPosition(id, facilityID, name string, policies []Policy) (Position, error) {
	if err := domain.RequireText("役職の名前", name, maxNameLen); err != nil {
		return Position{}, err
	}
	seen := make(map[string]bool, len(policies))
	for _, p := range policies {
		if seen[p.ID] {
			return Position{}, domain.Invalid("権限 %s が重なっています", p.ID)
		}
		if p.NeedsTarget && !p.Code.TargetsTeam() {
			return Position{}, domain.Invalid("権限 %s は対象の職員を指定するので、役職の既定にできません", p.ID)
		}
		seen[p.ID] = true
	}
	return Position{ID: id, FacilityID: facilityID, Name: name, Policies: policies}, nil
}

// FacilityRepository は、事業所を読む。見つからないときは domain.ErrNotFound を返す。
// GetByOrgID は、認証のブローカーの組織の ID に結び付けた事業所を返す。
type FacilityRepository interface {
	Get(ctx context.Context, id string) (Facility, error)
	GetByOrgID(ctx context.Context, orgID string) (Facility, error)
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

// PolicyRepository は、権限を読む。見つからないときは domain.ErrNotFound を返す。ListByIDs は、見つかったものだけを返す。
type PolicyRepository interface {
	Get(ctx context.Context, id string) (Policy, error)
	List(ctx context.Context) ([]Policy, error)
	ListByIDs(ctx context.Context, ids []string) ([]Policy, error)
}
