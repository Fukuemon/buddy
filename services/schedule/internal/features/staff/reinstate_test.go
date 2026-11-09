package staff_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestStaffReinstate(t *testing.T) {
	ctx := context.Background()
	onLeave := func() (*inmem.Store, *inmem.Identities) {
		s, ids := stopFixture()
		if _, err := stopApp(s, ids, allow).Leave(ctx, staffID, staff.LeaveInput{ReturnDate: &civil.Date{Year: 2027, Month: 4, Day: 1}}); err != nil {
			t.Fatal(err)
		}
		return s, ids
	}

	// 休職の職員を復職にしたとき、同じ上流のアカウントでログインできる（#268 の検証の観点 2）。ブローカーの職員の ID は変わらない
	s, ids := onLeave()
	got, err := stopApp(s, ids, allow).Reinstate(ctx, staffID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status() != staff.StatusActive || got.LeaveReturnDate != nil || ids.Members["broker-1"].Suspended || *got.Sub != "broker-1" {
		t.Fatalf("職員 = %+v, ブローカー = %+v, want 両方で有効に戻し、同じブローカーの職員", got.Staff, ids.Members)
	}
	if _, err := stopApp(s, ids, allow).Reinstate(ctx, staffID); err != nil {
		t.Errorf("有効な職員の復職の err = %v, want 成功", err)
	}

	t.Run("職員の管理の権限が無ければ ErrForbidden", func(t *testing.T) {
		s, ids := onLeave()
		if _, err := stopApp(s, ids, deny).Reinstate(ctx, staffID); !errors.Is(err, apperr.ErrForbidden) || s.Staff[staffID].Status() != staff.StatusOnLeave {
			t.Errorf("err = %v, want ErrForbidden で戻さない", err)
		}
	})
	t.Run("ブローカーに届かなければ、休職を外してからエラーで、送り直すと戻す", func(t *testing.T) {
		s, ids := onLeave()
		ids.ResumeErr = errors.New("broker down")
		if _, err := stopApp(s, ids, allow).Reinstate(ctx, staffID); err == nil || s.Staff[staffID].Status() != staff.StatusActive || !ids.Members["broker-1"].Suspended {
			t.Fatalf("err = %v, want 予定の API で休職を外し、ブローカーは止めたままエラー", err)
		}
		ids.ResumeErr = nil
		if _, err := stopApp(s, ids, allow).Reinstate(ctx, staffID); err != nil || ids.Members["broker-1"].Suspended {
			t.Errorf("送り直し: err = %v, want ブローカーの職員も戻す", err)
		}
	})
	t.Run("ブローカーで退職していれば ErrConflict", func(t *testing.T) {
		s, ids := onLeave()
		m := ids.Members["broker-1"]
		m.Retired = true
		ids.Members["broker-1"] = m
		if _, err := stopApp(s, ids, allow).Reinstate(ctx, staffID); !errors.Is(err, apperr.ErrConflict) {
			t.Errorf("err = %v, want ErrConflict", err)
		}
		if d := s.Staff[staffID]; d.Status() != staff.StatusOnLeave || d.LeaveReturnDate == nil || *d.LeaveReturnDate != (civil.Date{Year: 2027, Month: 4, Day: 1}) {
			t.Errorf("職員 = %+v, want 外した休職を戻る予定の日ごと書き戻す", d.Staff)
		}
	})
	t.Run("休職を外した後に休職にし直されていれば、ブローカーの職員を戻さない", func(t *testing.T) {
		s, ids := onLeave()
		u := build(deps{
			Facilities: inmem.Facilities{Store: s}, Staff: inmem.Staff{Store: s}, Identities: ids,
			Assignments: inmem.StaffAssignments{Store: s},
		}, &betweenTx{after: 1, run: func() {
			d := s.Staff[staffID]
			d.LeaveStartedAt = ptr(time.Now())
			s.Staff[staffID] = d
		}}, &inmem.SeqIDs{}, allow)
		if _, err := u.Reinstate(ctx, staffID); !errors.Is(err, apperr.ErrConflict) || !ids.Members["broker-1"].Suspended {
			t.Errorf("err = %v, ブローカー = %+v, want ErrConflict でブローカーは止めたまま", err, ids.Members)
		}
	})
	t.Run("退職した職員は ErrConflict", func(t *testing.T) {
		s, ids := stopFixture()
		clearAssignments(s)
		if _, err := stopApp(s, ids, allow).Retire(ctx, staffID); err != nil {
			t.Fatal(err)
		}
		if _, err := stopApp(s, ids, allow).Reinstate(ctx, staffID); !errors.Is(err, apperr.ErrConflict) || s.Staff[staffID].Status() != staff.StatusRetired {
			t.Errorf("err = %v, want ErrConflict で退職のまま", err)
		}
	})
}
