package inmem

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
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
	// OrgID と OtherOrgID は、2 つの事業所の認証の組織の ID である。
	OrgID      = "org-a"
	OtherOrgID = "org-b"
)

// Seeded は、2 つの事業所と、その職員、利用者、訪問の情報のマスタ、予定の種類、繰り返しの予定を入れた Store を返す。
func Seeded() *Store {
	s := NewStore()
	s.Facilities[FacilityID] = organization.Facility{ID: FacilityID, OrgID: OrgID, SourceMode: organization.SourceBuddyPrimary}
	s.Facilities[OtherFacilityID] = organization.Facility{ID: OtherFacilityID, OrgID: OtherOrgID, SourceMode: organization.SourceBuddyPrimary}
	for id, fid := range map[string]string{StaffID: FacilityID, CompanionID: FacilityID, OtherStaffID: OtherFacilityID} {
		s.Staff[id] = staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: id, FacilityID: fid}}}
	}
	s.Patients[PatientID] = patient.Detail{Patient: patient.Patient{ID: PatientID, FacilityID: FacilityID}}
	s.Patients[OtherPatientID] = patient.Detail{Patient: patient.Patient{ID: OtherPatientID, FacilityID: OtherFacilityID}}
	s.Codes[CodeID] = servicecode.ServiceCode{ID: CodeID}
	s.Categories[CategoryID] = visit.Category{ID: CategoryID}
	s.Types[NormalTypeID] = schedule.Type{ID: NormalTypeID, Code: schedule.CodeNormal, Name: schedule.Normal}
	s.Types[VisitTypeID] = schedule.Type{ID: VisitTypeID, Code: schedule.CodeVisit, Name: schedule.Visit}
	s.Recurring[RecurringID] = scheduleview.RecurringDetail{RecurringSchedule: schedule.RecurringSchedule{
		ID:   RecurringID,
		Slot: schedule.Slot{FacilityID: FacilityID, StaffID: StaffID, Date: civil.Date{Year: 2026, Month: 10, Day: 5}},
		Rule: schedule.Rule{Frequency: schedule.Weekly, DaysOfWeek: []int{1}, Interval: 1},
	}}
	return s
}

// PutVisitInfo は、利用者 patientID の訪問の情報 id を s に入れる。事業所は FacilityID、担当の職員は StaffID にする。
// visit を import しないテストが、訪問の予定の前提を作るために使う。
func (s *Store) PutVisitInfo(id, patientID string) {
	s.Infos[id] = visit.Info{ID: id, FacilityID: FacilityID, PatientID: patientID, AssignedStaffID: StaffID}
}
