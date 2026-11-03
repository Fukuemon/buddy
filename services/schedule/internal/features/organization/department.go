package organization

import (
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
