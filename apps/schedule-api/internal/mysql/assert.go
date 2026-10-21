package mysql

import (
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/tx"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

var (
	_ tx.Transactor                     = (*Transactor)(nil)
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
