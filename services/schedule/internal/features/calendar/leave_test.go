package calendar_test

import (
	"context"
	"errors"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
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

// lockHook は、Share の前に run を呼ぶ FacilityLock である。ロックを待つ間に、ほかのトランザクションが職員を書いて
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

// 退職した職員には、カレンダーを結び付けられない。休職の職員には結び付けられる（#278）。
func TestLinkRejectsRetiredStaff(t *testing.T) {
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {}}}
	e := newEnv(t, srv)
	delete(e.store.Calendars, calID)

	retire(t, e.store)
	if _, err := e.uc.Link(e.ctx, inmem.FacilityID, inmem.StaffID, googleCalID); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("退職した職員: err = %v, want ErrInvalidInput", err)
	}

	d := e.store.Staff[inmem.StaffID]
	d.RetiredAt = nil
	e.store.Staff[inmem.StaffID] = d
	uc := withLocks(e, gcal.NewReader(gcaltest.Start(t, srv)),
		lockHook{Facilities: inmem.Facilities{Store: e.store}, run: func() { retire(t, e.store) }})
	if _, err := uc.Link(e.ctx, inmem.FacilityID, inmem.StaffID, googleCalID); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("確認の後に退職した職員: err = %v, want ErrInvalidInput", err)
	}
	if len(e.store.Calendars) != 0 {
		t.Errorf("退職した職員に結び付けた: %+v", e.store.Calendars)
	}

	d = e.store.Staff[inmem.StaffID]
	d.RetiredAt = nil
	e.store.Staff[inmem.StaffID] = d
	setLeave(e.store, true)
	if c, err := e.uc.Link(e.ctx, inmem.FacilityID, inmem.StaffID, googleCalID); err != nil || c.StaffID != inmem.StaffID {
		t.Errorf("休職の職員: %+v, %v, want 結び付けられる", c, err)
	}
	if st, _ := (inmem.StaffRefs{Store: e.store}).Get(e.ctx, inmem.StaffID); st.Status != staff.StatusOnLeave {
		t.Errorf("職員の状態 = %s", st.Status)
	}
}
