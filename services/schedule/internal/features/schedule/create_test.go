package schedule_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestSchedulesCreate(t *testing.T) {
	tests := []struct {
		name       string
		facilityID string
		in         func() schedule.SlotInput
		wantErr    error
		wantInfos  int
	}{
		{name: "通常の予定", facilityID: facilityID, in: normalSlot},
		{name: "訪問の予定", facilityID: facilityID, in: func() schedule.SlotInput { return visitSlot(validVisit()) }, wantInfos: 1},
		{name: "事業所がない", facilityID: "MISSING", in: normalSlot, wantErr: apperr.ErrNotFound},
		{name: "予定の種類がない", facilityID: facilityID, in: func() schedule.SlotInput {
			in := normalSlot()
			in.TypeID = "MISSING"
			return in
		}, wantErr: apperr.ErrInvalidInput},
		{name: "別の事業所の職員", facilityID: facilityID, in: func() schedule.SlotInput {
			in := normalSlot()
			in.StaffID = otherStaffID
			return in
		}, wantErr: apperr.ErrInvalidInput},
		{name: "通常の予定に訪問の情報", facilityID: facilityID, in: func() schedule.SlotInput {
			in := normalSlot()
			v := validVisit()
			in.Visit = &v
			return in
		}, wantErr: apperr.ErrInvalidInput},
		{name: "別の事業所の利用者", facilityID: facilityID, in: func() schedule.SlotInput {
			v := validVisit()
			v.PatientID = otherPatientID
			return visitSlot(v)
		}, wantErr: apperr.ErrInvalidInput},
		{name: "別の事業所の同行者", facilityID: facilityID, in: func() schedule.SlotInput {
			v := validVisit()
			v.CompanionID = ptr(otherStaffID)
			return visitSlot(v)
		}, wantErr: apperr.ErrInvalidInput},
		{name: "訪問の区分がない", facilityID: facilityID, in: func() schedule.SlotInput {
			v := validVisit()
			v.CategoryIDs = []string{"MISSING"}
			return visitSlot(v)
		}, wantErr: apperr.ErrInvalidInput},
		{name: "サービスコードがない", facilityID: facilityID, in: func() schedule.SlotInput {
			v := validVisit()
			v.ServiceCodeID = "MISSING"
			return visitSlot(v)
		}, wantErr: apperr.ErrInvalidInput},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := inmem.Seeded()
			uc, tx := newSchedules(s)
			got, err := uc.Create(editorCtx(), tt.facilityID, tt.in())
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("err = %v, want %v", err, tt.wantErr)
				}
				if len(s.Schedules) != 0 {
					t.Errorf("予定が %d 件保存された", len(s.Schedules))
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if tx.Calls != 1 {
				t.Errorf("トランザクションの回数 = %d", tx.Calls)
			}
			if got.FacilityID != facilityID || got.StaffID != staffID {
				t.Errorf("got %+v", got.Schedule)
			}
			if !got.IsOverTimeWork {
				t.Error("17 時 30 分に始まる予定が時間外にならない")
			}
			if len(s.Infos) != tt.wantInfos {
				t.Errorf("訪問の情報 = %d 件, want %d", len(s.Infos), tt.wantInfos)
			}
			if tt.wantInfos > 0 && (got.VisitInfoID == nil || s.Infos[*got.VisitInfoID].PatientID != patientID) {
				t.Errorf("VisitInfoID = %v", got.VisitInfoID)
			}
		})
	}
}
