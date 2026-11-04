package calendarsync_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
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

// 休職の職員の、既に取り込んだか書き出した予定を Google カレンダーで変えたとき、同期は今と同じく buddy の予定に当てる
// （#278 の検証の観点 4）。
func TestSyncAppliesChangeWhileStaffOnLeave(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	setLeave(e.store, true)

	e.shift(t, eventID(t, d.ID))
	e.sync(t)
	if got := e.schedule(t, d.ID); got.StartTime != (civil.Time{Hour: 11}) || got.StaffID != inmem.StaffID {
		t.Errorf("休職の職員の予定 = %+v, want Google の変更を当てる", got.Slot)
	}
}

// 同期がカレンダーを取った後に職員が退職し、カレンダーが外れたとき、退職した職員の予定に Google の変更を当てない（#278）。
func TestSyncStopsWhenCalendarDetachedDuringSync(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	before := e.schedule(t, d.ID)
	e.shift(t, eventID(t, d.ID))

	syncer := newSyncer(e.store, gcal.NewReader(gcaltest.Start(t, e.srv)), &[]string{},
		lockHook{Facilities: inmem.Facilities{Store: e.store}, run: func() { retire(t, e.store) }})
	if _, err := syncer.SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := e.schedule(t, d.ID); got.StartTime != before.StartTime || got.Version != before.Version {
		t.Errorf("退職した職員の予定 = %+v, want 当てない", got.Slot)
	}

	// 外したカレンダーは、次の同期で取らない
	n, err := e.syncer.SyncDue(t.Context())
	if err != nil || n != 0 {
		t.Errorf("外した後の同期 = %d 件, %v, want 取らない", n, err)
	}
}

// 退職でカレンダーが外れた後は、確認が必要な予定を Google の内容に合わせられない。合わせる操作が予定の行をロックした後に
// 退職したときも同じく拒み、退職した職員の予定を今日以降へ動かさない（#278）。
func TestAcceptExportRejectsDetachedCalendar(t *testing.T) {
	setup := func(t *testing.T) (syncEnv, string, string) {
		t.Helper()
		e := newSyncEnv(t)
		d := e.created(t)
		code := calendar.ErrorPreconditionFailed
		x := e.export(t, d.ID)
		x.ID, x.Status, x.ErrorCode, x.Revision = "HELD", calendar.ExportConflict, &code, 1
		e.store.Exports[x.ID] = x
		e.shift(t, eventID(t, d.ID))
		return e, d.ID, x.ID
	}
	check := func(t *testing.T, e syncEnv, scheduleID string, err error) {
		t.Helper()
		var ce *apperr.ConflictError
		if !errors.As(err, &ce) || ce.Code != calendar.CodeExportNotAcceptable {
			t.Fatalf("err = %v, want %s", err, calendar.CodeExportNotAcceptable)
		}
		if got := e.schedule(t, scheduleID); got.StartTime == (civil.Time{Hour: 11}) {
			t.Errorf("退職した職員の予定に Google の内容を当てた: %+v", got.Slot)
		}
	}

	t.Run("退職の後", func(t *testing.T) {
		e, scheduleID, exportID := setup(t)
		retire(t, e.store)
		_, err := e.uc.AcceptExport(e.ctx, exportID)
		check(t, e, scheduleID, err)
	})
	t.Run("予定の行をロックした後に退職", func(t *testing.T) {
		e, scheduleID, exportID := setup(t)
		s := e.store
		uc := calendarsync.NewAcceptExport(inmem.Exports{Store: s}, inmem.Schedules{Store: s}, inmem.Calendars{Store: s},
			oneAccount{gcal.NewReader(gcaltest.Start(t, e.srv))}, inmem.StaffRefs{Store: s}, lockHook{Facilities: inmem.Facilities{Store: s}, run: func() { retire(t, s) }},
			inmem.ScheduleTypes{Store: s}, nil, nil, nil, &inmem.Tx{}, &inmem.SeqIDs{}, principal.RequireStaffManage)
		_, err := uc.Do(e.ctx, exportID)
		check(t, e, scheduleID, err)
	})
}

// 予定をほかの職員に割り振り直した後にその職員が退職したとき、予定の対応のカレンダーが外れていなくても、
// Google の内容に合わせない（#278）。
func TestAcceptExportRejectsScheduleOfRetiredStaff(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	code := calendar.ErrorPreconditionFailed
	x := e.export(t, d.ID)
	x.ID, x.Status, x.ErrorCode, x.Revision = "HELD", calendar.ExportConflict, &code, 1
	e.store.Exports[x.ID] = x
	e.shift(t, eventID(t, d.ID))
	sc := e.store.Schedules[d.ID]
	sc.StaffID = inmem.CompanionID
	e.store.Schedules[d.ID] = sc
	c := e.store.Staff[inmem.CompanionID]
	now := time.Now()
	c.RetiredAt = &now
	e.store.Staff[inmem.CompanionID] = c

	_, err := e.uc.AcceptExport(e.ctx, x.ID)
	var ce *apperr.ConflictError
	if !errors.As(err, &ce) || ce.Code != calendar.CodeExportNotAcceptable {
		t.Fatalf("err = %v, want %s", err, calendar.CodeExportNotAcceptable)
	}
	if got := e.schedule(t, d.ID); got.StartTime == (civil.Time{Hour: 11}) {
		t.Errorf("退職した職員の予定に Google の内容を当てた: %+v", got.Slot)
	}
}

// カレンダーを外すようにする前に退職にした職員のカレンダーが残っていても、同期は当てない（#278）。
func TestSyncSkipsRetiredStaffWithLinkedCalendar(t *testing.T) {
	e := newSyncEnv(t)
	d := e.created(t)
	before := e.schedule(t, d.ID)
	e.shift(t, eventID(t, d.ID))
	st := e.store.Staff[inmem.StaffID]
	now := time.Now()
	st.RetiredAt = &now
	e.store.Staff[inmem.StaffID] = st

	e.sync(t)
	if got := e.schedule(t, d.ID); got.StartTime != before.StartTime || got.Version != before.Version {
		t.Errorf("退職した職員の予定 = %+v, want 当てない", got.Slot)
	}
}
