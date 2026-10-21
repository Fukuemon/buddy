package inmem

import (
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/organization"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/patient"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/staff"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

// Seeded が入れる値の ID。
const (
	FacilityID      = "FACILITY"
	OtherFacilityID = "OTHER"
	StaffID         = "STAFF"
	CompanionID     = "COMPANION"
	OtherStaffID    = "OTHERSTAFF"
	PatientID       = "PATIENT"
	OtherPatientID  = "OTHERPATIENT"
	CodeID          = "CODE"
	CategoryID      = "CATEGORY"
	NormalTypeID    = "NORMAL"
	VisitTypeID     = "VISIT"
	RecurringID     = "RECURRING"
)

// Seeded は、2 つの事業所と、その職員、利用者、訪問の情報のマスタ、予定の種類、繰り返しの予定を入れた Store を返す。
func Seeded() *Store {
	s := NewStore()
	s.Facilities[FacilityID] = organization.Facility{ID: FacilityID}
	s.Facilities[OtherFacilityID] = organization.Facility{ID: OtherFacilityID}
	for id, fid := range map[string]string{StaffID: FacilityID, CompanionID: FacilityID, OtherStaffID: OtherFacilityID} {
		s.Staff[id] = staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, FacilityID: fid}}}
	}
	s.Patients[PatientID] = patient.Detail{Patient: patient.Patient{ID: PatientID, FacilityID: FacilityID}}
	s.Patients[OtherPatientID] = patient.Detail{Patient: patient.Patient{ID: OtherPatientID, FacilityID: OtherFacilityID}}
	s.Codes[CodeID] = visit.ServiceCode{ID: CodeID}
	s.Categories[CategoryID] = visit.Category{ID: CategoryID}
	s.Types[NormalTypeID] = schedule.Type{ID: NormalTypeID, Name: schedule.Normal}
	s.Types[VisitTypeID] = schedule.Type{ID: VisitTypeID, Name: schedule.Visit}
	s.Recurring[RecurringID] = schedule.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{
		ID:   RecurringID,
		Slot: schedule.Slot{FacilityID: FacilityID, StaffID: StaffID, Date: civil.Date{Year: 2026, Month: 10, Day: 5}},
		Rule: schedule.Rule{Frequency: schedule.Weekly},
	}}
	return s
}
