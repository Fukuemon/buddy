package calendarsync_test

import (
	"context"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// setLeave は、カレンダーを結び付けた職員 inmem.StaffID を、on なら休職に、そうでなければ有効にする。
func setLeave(s *inmem.Store, on bool) {
	d := s.Staff[inmem.StaffID]
	d.LeaveStartedAt = nil
	if on {
		now := time.Now()
		d.LeaveStartedAt = &now
	}
	s.Staff[inmem.StaffID] = d
}

// retire は、職員 inmem.StaffID を退職にし、退職と同じくカレンダーを外す。
func retire(t *testing.T, s *inmem.Store) {
	t.Helper()
	d := s.Staff[inmem.StaffID]
	now := time.Now()
	d.LeaveStartedAt, d.RetiredAt = nil, &now
	s.Staff[inmem.StaffID] = d
	if err := (inmem.Calendars{Store: s}).DetachByStaff(context.Background(), inmem.StaffID); err != nil {
		t.Fatal(err)
	}
}

// lockHook は、Share か GetForShare の前に run を呼ぶ FacilityLock である。ロックを待つ間に、ほかのトランザクションが職員を書いて
// コミットしたことを表す。
type lockHook struct {
	inmem.Facilities
	run func()
}

func (h lockHook) Share(ctx context.Context, facilityID string) error {
	if h.run != nil {
		h.run()
	}
	return h.Facilities.Share(ctx, facilityID)
}

func (h lockHook) GetForShare(ctx context.Context, facilityID string) (organization.Facility, error) {
	if h.run != nil {
		h.run()
	}
	return h.Facilities.GetForShare(ctx, facilityID)
}

// 休職の職員のカレンダーで変えた予定も、同期は今と同じく Projection に写す（#278 の検証の観点 4）。
func TestSyncProjectsChangeWhileStaffOnLeave(t *testing.T) {
	e := newProjectionEnv(t)
	setLeave(e.store, true)
	e.srv.Put(googleCalID, gevent("added", "Google で足した予定", "2099-11-06T10:00:00+09:00", "2099-11-06T11:00:00+09:00"))

	e.sync(t)
	if got := e.mustRow(t, "added"); got.StaffID != inmem.StaffID {
		t.Errorf("休職の職員の予定の行 = %+v, want 写す", got)
	}
}

// カレンダーを外すようにする前に退職にした職員のカレンダーが残っていても、同期は写さない（#278）。
func TestSyncSkipsRetiredStaffWithLinkedCalendar(t *testing.T) {
	e := newProjectionEnv(t)
	e.srv.Put(googleCalID, gevent("added", "Google で足した予定", "2099-11-06T10:00:00+09:00", "2099-11-06T11:00:00+09:00"))
	st := e.store.Staff[inmem.StaffID]
	now := time.Now()
	st.RetiredAt = &now
	e.store.Staff[inmem.StaffID] = st

	e.sync(t)
	if len(e.store.Projections) != 0 {
		t.Errorf("退職した職員の予定を写した: %+v", e.store.Projections)
	}
}
