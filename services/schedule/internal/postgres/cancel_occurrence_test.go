package postgres

import (
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// TestCancelOccurrenceVisit は、訪問の繰り返しの予定の 1 回のキャンセルが、PostgreSQL の上で、繰り返しの予定の
// 訪問の情報を写したキャンセルした単発の予定を作り、1 件の取得がその予定をキャンセルと訪問の情報を付けて返すことを確認する。
// 訪問の情報は予定ごとに 1 つなので、同じ繰り返しの予定の 2 つ目の回もキャンセルできることを確認する。
func TestCancelOccurrenceVisit(t *testing.T) {
	ctx := principal.With(txContext(t), principal.Principal{Staff: principal.Staff{
		ID: seedMori, FacilityID: seedFacility, Policies: []staff.PolicyGrant{{PolicyCode: organization.ScheduleAllEdit}},
	}})
	ids := ulid.Generator{}
	facilities, schedules, recurring := NewFacilityRepository(testDB), NewScheduleRepository(testDB), NewRecurringScheduleRepository(testDB)
	types, refs, txr := NewScheduleTypeRepository(testDB), NewStaffRefRepository(testDB), NewTransactor(testDB)
	visits := visit.NewWriter(visit.WriterDeps{
		Staff: refs, Patients: NewPatientRepository(testDB), Infos: NewVisitInfoRepository(testDB),
		ServiceCodes: NewServiceCodeRepository(testDB), Categories: NewVisitCategoryRepository(testDB),
	}, ids)
	rs, err := schedule.NewCreateRecurring(facilities, types, refs, facilities, visits, nil, recurring, nil, txr, ids).Do(ctx, seedFacility, schedule.SlotInput{
		TypeID: seedVisitType, Date: civil.Date{Year: 2099, Month: 1, Day: 5}, StartTime: civil.Time{Hour: 9}, EndTime: civil.Time{Hour: 10}, StaffID: seedMori,
		Visit: &visit.Input{PatientID: seedPatient, AssignedStaffID: seedMori, ServiceCodeID: seedServiceCode, CategoryIDs: []string{seedEmergency}},
	}, schedule.RuleInput{Frequency: schedule.Weekly})
	if err != nil {
		t.Fatal(err)
	}

	cancel := schedule.NewCancelOccurrence(recurring, refs, facilities, schedules, types, visits, nil, txr, ids)
	seen := map[string]bool{*rs.VisitInfoID: true}
	for _, date := range []civil.Date{{Year: 2099, Month: 1, Day: 12}, {Year: 2099, Month: 1, Day: 19}} {
		c, err := cancel.Do(ctx, rs.ID, date, "利用者の入院")
		if err != nil {
			t.Fatalf("%s の回のキャンセル: %v", date, err)
		}
		got, err := schedules.Get(ctx, c.ScheduleID)
		if err != nil {
			t.Fatal(err)
		}
		if got.Cancel == nil || got.Cancel.Reason != "利用者の入院" || got.Date != date || got.OriginalDate == nil || *got.OriginalDate != date {
			t.Errorf("キャンセルした回 = %+v", got)
		}
		if got.Visit == nil || got.Visit.PatientID != seedPatient || len(got.Visit.Categories) != 1 || got.VisitInfoID == nil || seen[*got.VisitInfoID] {
			t.Errorf("%s の回の訪問の情報 = %+v, want 繰り返しの予定と同じ内容の、別の訪問の情報", date, got.Visit)
		}
		if got.VisitInfoID != nil {
			seen[*got.VisitInfoID] = true
		}
	}
}
