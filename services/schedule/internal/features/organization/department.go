package organization

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Department は、事業所の部署である。
type Department struct {
	ID         string
	FacilityID string
	Name       string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// NewDepartment は、名前を検証して Department を作る。
func NewDepartment(id, facilityID, name string) (Department, error) {
	if err := kernel.ValidateText("部署の名前", name, maxNameLen); err != nil {
		return Department{}, err
	}
	return Department{ID: id, FacilityID: facilityID, Name: name}, nil
}

// DepartmentRepository は、部署を読み書きする。見つからないときは apperr.ErrNotFound を、
// 同じ事業所に同じ名前があるときは apperr.ErrConflict を返す。Update は、部署 d.ID の名前を d の値にする。
type DepartmentRepository interface {
	Get(ctx context.Context, id string) (Department, error)
	ListByFacility(ctx context.Context, facilityID string) ([]Department, error)
	Create(ctx context.Context, d Department) error
	Update(ctx context.Context, d Department) error
}
