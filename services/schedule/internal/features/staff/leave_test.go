package staff_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// 職員の管理の権限を持つ職員が職員を休職にしたとき、休職の職員はログインできず、その日以降の予定と担当の利用者の一覧が
// 警告として返る（#268 の検証の観点 1）。
func TestStaffLeave(t *testing.T) {
	ctx := context.Background()
	returnDate := civil.Date{Year: 2027, Month: 4, Day: 1}

	s, ids := stopFixture()
	s.Schedules["PAST"] = scheduleview.Detail{Schedule: schedule.Schedule{ID: "PAST", Slot: schedule.Slot{
		FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 22}}}}
	s.Schedules["TODAY"] = scheduleview.Detail{Schedule: schedule.Schedule{ID: "TODAY", Slot: schedule.Slot{
		FacilityID: facilityID, StaffID: staffID, Date: civil.Date{Year: 2026, Month: 10, Day: 23}}}}
	p := s.Patients[inmem.PatientID]
	p.AssignedStaffID, p.Name = staffID, "山田 花子"
	s.Patients[inmem.PatientID] = p

	got, err := stopApp(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{ReturnDate: &returnDate})
	if err != nil {
		t.Fatal(err)
	}
	if got.Staff.Status() != staff.StatusOnLeave || *got.Staff.LeaveReturnDate != returnDate || !ids.Members["broker-1"].Suspended {
		t.Fatalf("職員 = %+v, ブローカー = %+v, want 両方で休職にし、戻る予定の日を持つ", got.Staff.Staff, ids.Members)
	}
	a := got.Assignments
	if len(a.Schedules) != 1 || a.Schedules[0].ID != "TODAY" || len(a.RecurringSchedules) != 1 || a.RecurringSchedules[0].ID != inmem.RecurringID ||
		len(a.Patients) != 1 || a.Patients[0].Name != "山田 花子" {
		t.Errorf("残る一覧 = %+v, want 当日の予定（事業所の現地の日付）と繰り返しの予定と担当の利用者", a)
	}

	first := *got.Staff.LeaveStartedAt
	again, err := stopApp(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{})
	if err != nil || !again.Staff.LeaveStartedAt.Equal(first) || again.Staff.LeaveReturnDate != nil {
		t.Errorf("休職にし直し = %+v, %v, want 最初の時刻 %v のまま、戻る予定の日だけを消す", again.Staff.Staff, err, first)
	}
}

func TestStaffLeaveRejects(t *testing.T) {
	ctx := context.Background()
	t.Run("職員の管理の権限が無ければ ErrForbidden で書かない", func(t *testing.T) {
		s, ids := stopFixture()
		if _, err := stopApp(s, ids, deny).Leave(ctx, staffID, staff.LeaveInput{}); !errors.Is(err, apperr.ErrForbidden) ||
			ids.Members["broker-1"].Suspended || s.Staff[staffID].LeaveStartedAt != nil {
			t.Errorf("err = %v, want ErrForbidden で休職にしない", err)
		}
	})
	t.Run("ブローカーで止められなければ、予定の API にも書かない", func(t *testing.T) {
		s, ids := stopFixture()
		ids.Err = errors.New("broker down")
		if _, err := stopApp(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{}); err == nil || s.Staff[staffID].LeaveStartedAt != nil {
			t.Errorf("err = %v, LeaveStartedAt = %v, want エラーで予定の API にも書かない", err, s.Staff[staffID].LeaveStartedAt)
		}
	})
	t.Run("取り消しに失敗すれば、両方で休職にしてからエラー", func(t *testing.T) {
		s, ids := stopFixture()
		ids.RevokeErr = errors.New("hydra down")
		if _, err := stopApp(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{}); err == nil ||
			s.Staff[staffID].LeaveStartedAt == nil || !ids.Members["broker-1"].Suspended {
			t.Errorf("err = %v, LeaveStartedAt = %v, want 両方で休職にしてからエラー", err, s.Staff[staffID].LeaveStartedAt)
		}
	})
	t.Run("ブローカーにいない職員は、予定の API でだけ休職にする", func(t *testing.T) {
		s, ids := stopFixture()
		delete(ids.Members, "broker-1")
		if got, err := stopApp(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{}); err != nil || got.Staff.Status() != staff.StatusOnLeave {
			t.Errorf("職員 = %+v, err = %v, want 予定の API でだけ休職にする", got.Staff.Staff, err)
		}
	})
	t.Run("退職した職員は ErrConflict", func(t *testing.T) {
		s, ids := stopFixture()
		d := s.Staff[staffID]
		d.RetiredAt = ptr(time.Now())
		s.Staff[staffID] = d
		if _, err := stopApp(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{}); !errors.Is(err, apperr.ErrConflict) || ids.Members["broker-1"].Suspended {
			t.Errorf("err = %v, want ErrConflict でブローカーを止めない", err)
		}
	})
	t.Run("いない職員は ErrNotFound", func(t *testing.T) {
		s, ids := stopFixture()
		if _, err := stopApp(s, ids, allow).Leave(ctx, "NONE", staff.LeaveInput{}); !errors.Is(err, apperr.ErrNotFound) {
			t.Errorf("err = %v, want ErrNotFound", err)
		}
	})
}
