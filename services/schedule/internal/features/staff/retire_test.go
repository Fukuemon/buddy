package staff_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// 予定と担当が残らない職員を退職にしたとき、ログインできず、電話番号が消え、名前は残る（#268 の検証の観点 4）。
func TestStaffRetire(t *testing.T) {
	ctx := context.Background()
	s, ids := stopFixture()
	clearAssignments(s)
	d := s.Staff[staffID]
	d.Username = "青木 陽菜"
	d.LeaveStartedAt = ptr(time.Now())
	s.Staff[staffID] = d
	s.Schedules["PAST"] = schedule.Detail{Schedule: schedule.Schedule{ID: "PAST", Slot: schedule.Slot{
		FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 22}}}}
	s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID, Provider: calendar.ProviderGoogle, CalendarID: "staff@example.com"}
	s.Links["LINK"] = calendar.Link{ID: "LINK", FacilityID: facilityID, ExternalCalendarID: "CAL", ExternalEventID: "EV", ScheduleID: ptr("PAST")}

	got, err := stopUsecase(s, ids, allow).Retire(ctx, staffID)
	if err != nil {
		t.Fatal(err)
	}
	// 退職は職員のカレンダーを外し、カレンダーのレコードと予定の対応は残す（#278 の検証の観点 1）
	if c, ok := s.Calendars["CAL"]; !ok || c.DisabledAt == nil {
		t.Errorf("カレンダー = %+v, want 退職で外す", c)
	}
	if _, ok := s.Links["LINK"]; !ok {
		t.Error("予定の対応が消えた, want 退職で外しても残す")
	}
	st := got.Staff
	if st.Status() != staff.StatusRetired || st.Username != "青木 陽菜" || st.Email != "" || st.PhoneNumber != nil || st.LeaveStartedAt != nil {
		t.Fatalf("職員 = %+v, want 退職で名前を残し、メールと電話番号と休職を消す", st.Staff)
	}
	if m := ids.Members["broker-1"]; !m.Retired || m.Email != "" {
		t.Errorf("ブローカー = %+v, want 退職でメールを消す", m)
	}
	if !got.Assignments.IsEmpty() {
		t.Errorf("残る一覧 = %+v, want 空（過去の予定は数えない）", got.Assignments)
	}
	first := *st.RetiredAt
	again, err := stopUsecase(s, ids, allow).Retire(ctx, staffID)
	if err != nil || !again.Staff.RetiredAt.Equal(first) {
		t.Errorf("退職にし直し = %v, %v, want 最初の時刻 %v のまま成功", again.Staff.RetiredAt, err, first)
	}

	t.Run("取り消しに失敗すれば、両方で退職にしてからエラー", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		ids.RevokeErr = errors.New("hydra down")
		if _, err := stopUsecase(s, ids, allow).Retire(ctx, staffID); err == nil || s.Staff[staffID].Status() != staff.StatusRetired || !ids.Members["broker-1"].Retired {
			t.Errorf("err = %v, want 両方で退職にしてからエラー", err)
		}
	})
	t.Run("ブローカーにいない職員は、予定の API でだけ退職にする", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		delete(ids.Members, "broker-1")
		if got, err := stopUsecase(s, ids, allow).Retire(ctx, staffID); err != nil || got.Staff.Status() != staff.StatusRetired {
			t.Errorf("err = %v, want 予定の API でだけ退職にする", err)
		}
	})
}

// その日以降の予定か担当の利用者が残る職員を退職にしようとしたとき、409 で残る一覧が返る（#268 の検証の観点 3）。
func TestStaffRetireRejectsAssignments(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name string
		edit func(*inmem.Store)
	}{
		{"繰り返しの予定", func(*inmem.Store) {}},
		{"その日の予定", func(s *inmem.Store) {
			clearAssignments(s)
			s.Schedules["TODAY"] = schedule.Detail{Schedule: schedule.Schedule{ID: "TODAY", Slot: schedule.Slot{
				FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 23}}}}
		}},
		{"同行者の予定", func(s *inmem.Store) {
			clearAssignments(s)
			s.Infos["INFO"] = visit.Info{ID: "INFO", AssignedStaffID: companionID, CompanionID: ptr(staffID)}
			s.Schedules["VISIT"] = schedule.Detail{Schedule: schedule.Schedule{ID: "VISIT", Slot: schedule.Slot{
				FacilityID: facilityID, StaffID: companionID, Date: civil.Date{Year: 2026, Month: 11, Day: 1}, VisitInfoID: ptr("INFO")}}}
		}},
		{"担当の利用者", func(s *inmem.Store) {
			clearAssignments(s)
			p := s.Patients[inmem.PatientID]
			p.AssignedStaffID = staffID
			s.Patients[inmem.PatientID] = p
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, ids := stopFixture()
			tt.edit(s)
			s.Calendars["CAL"] = calendar.ExternalCalendar{ID: "CAL", FacilityID: facilityID, StaffID: staffID}
			_, err := stopUsecase(s, ids, allow).Retire(ctx, staffID)
			if s.Calendars["CAL"].DisabledAt != nil {
				t.Error("退職を拒んだのにカレンダーを外した")
			}
			ae, ok := errors.AsType[*staff.AssignedError](err)
			if !ok || ae.Assignments.IsEmpty() || !errors.Is(err, apperr.ErrConflict) {
				t.Fatalf("err = %v, want 残る一覧を持つ AssignedError", err)
			}
			if s.Staff[staffID].Status() != staff.StatusActive || ids.Members["broker-1"].Retired || s.Staff[staffID].Email == "" {
				t.Errorf("職員 = %+v, want 両方に書かない", s.Staff[staffID].Staff)
			}
		})
	}
	// 担当の利用者が利用の終了の利用者だけなら、退職できる（#346 の検証の観点 4、ADR-0021）
	t.Run("利用の終了の担当の利用者は数えない", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		p := s.Patients[inmem.PatientID]
		p.AssignedStaffID = staffID
		p.EndedAt = ptr(time.Now())
		s.Patients[inmem.PatientID] = p
		got, err := stopUsecase(s, ids, allow).Retire(ctx, staffID)
		if err != nil || got.Staff.Status() != staff.StatusRetired {
			t.Errorf("err = %v, want 退職できる", err)
		}
	})
	t.Run("キャンセルした予定は数えない", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		s.Schedules["CANCELLED"] = schedule.Detail{Schedule: schedule.Schedule{ID: "CANCELLED", Slot: schedule.Slot{
			FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 11, Day: 1}}}}
		s.Cancels["CANCELLED"] = schedule.Cancel{ScheduleID: "CANCELLED"}
		if _, err := stopUsecase(s, ids, allow).Retire(ctx, staffID); err != nil {
			t.Errorf("err = %v, want 成功", err)
		}
	})
}
