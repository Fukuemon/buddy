package postgres

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

var (
	_ tx.Transactor                     = (*Transactor)(nil)
	_ organization.FacilityRepository   = (*FacilityRepository)(nil)
	_ organization.FacilityCreator      = (*FacilityRepository)(nil)
	_ organization.DepartmentRepository = (*DepartmentRepository)(nil)
	_ organization.TeamRepository       = (*TeamRepository)(nil)
	_ organization.PositionRepository   = (*PositionRepository)(nil)
	_ organization.PolicyRepository     = (*PolicyRepository)(nil)
	_ staff.Repository                  = (*StaffRepository)(nil)
	_ kernel.Finder[staff.Ref]          = (*StaffRefRepository)(nil)
	_ schedule.StaffRefs                = (*StaffRefRepository)(nil)
	_ patient.Repository                = (*PatientRepository)(nil)
	_ patient.ScheduleReader            = (*PatientScheduleReader)(nil)
	_ staff.FacilityLock                = (*FacilityRepository)(nil)
	_ patient.FacilityLock              = (*FacilityRepository)(nil)
	_ schedule.FacilityLock             = (*FacilityRepository)(nil)
	_ calendar.FacilityLock             = (*FacilityRepository)(nil)
	_ visit.InfoRepository              = (*VisitInfoRepository)(nil)
	_ visit.CategoryRepository          = (*VisitCategoryRepository)(nil)
	_ servicecode.Repository            = (*ServiceCodeRepository)(nil)
	_ schedule.Repository               = (*ScheduleRepository)(nil)
	_ schedule.RecurringRepository      = (*RecurringScheduleRepository)(nil)
	_ schedule.TypeRepository           = (*ScheduleTypeRepository)(nil)
)
