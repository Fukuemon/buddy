package postgres

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
	"github.com/Fukuemon/buddy/services/schedule/internal/visit"
)

var (
	_ tx.Transactor                     = (*Transactor)(nil)
	_ organization.FacilityRepository   = (*FacilityRepository)(nil)
	_ organization.DepartmentRepository = (*DepartmentRepository)(nil)
	_ organization.TeamRepository       = (*TeamRepository)(nil)
	_ organization.PositionRepository   = (*PositionRepository)(nil)
	_ organization.PolicyRepository     = (*PolicyRepository)(nil)
	_ staff.Repository                  = (*StaffRepository)(nil)
	_ kernel.Finder[staff.Ref]          = (*StaffRefRepository)(nil)
	_ schedule.StaffRefs                = (*StaffRefRepository)(nil)
	_ patient.Repository                = (*PatientRepository)(nil)
	_ visit.InfoRepository              = (*VisitInfoRepository)(nil)
	_ visit.MasterRepository            = (*VisitMasterRepository)(nil)
	_ schedule.Repository               = (*ScheduleRepository)(nil)
	_ schedule.RecurringRepository      = (*RecurringScheduleRepository)(nil)
	_ schedule.TypeRepository           = (*ScheduleTypeRepository)(nil)
)
