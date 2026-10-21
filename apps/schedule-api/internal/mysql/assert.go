package mysql

import (
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

var (
	_ domain.Transactor                 = (*Transactor)(nil)
	_ organization.FacilityRepository   = (*FacilityRepository)(nil)
	_ organization.DepartmentRepository = (*DepartmentRepository)(nil)
	_ organization.TeamRepository       = (*TeamRepository)(nil)
	_ organization.PositionRepository   = (*PositionRepository)(nil)
	_ organization.PolicyRepository     = (*PolicyRepository)(nil)
	_ staff.Repository                  = (*StaffRepository)(nil)
	_ patient.Repository                = (*PatientRepository)(nil)
	_ visit.Repository                  = (*VisitRepository)(nil)
	_ schedule.Repository               = (*ScheduleRepository)(nil)
)
