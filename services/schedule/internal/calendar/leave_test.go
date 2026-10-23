package calendar_test

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/staff"
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

func skipReasons(p calendar.Preview) map[calendar.SkipReason]int {
	out := map[calendar.SkipReason]int{}
	for _, s := range p.Skipped {
		out[s.Reason]++
	}
	return out
}

// 休職の職員のカレンダーの取り込みをプレビューしたとき、新しい予定は取り込まない予定に出て、確定しても作られない。
// 復職すると、結び付け直さずに取り込める（#278 の検証の観点 3、5）。
func TestPreviewWithholdsNewEventsOfStaffOnLeave(t *testing.T) {
	e := newEnv(t, fixture())
	setLeave(e.store, true)

	p, err := e.uc.Preview(e.ctx, calID, e.rng)
	if err != nil {
		t.Fatal(err)
	}
	if p.Counts.Import != 0 || p.Counts.NeedsReview != 0 || p.Counts.Recurring != 0 || len(p.NeedsReview) != 0 {
		t.Errorf("Counts = %+v, want 取り込む予定と確認が必要な予定なし", p.Counts)
	}
	// visit、ambiguous、missing、meeting、nocode、weekly、weekly の 11-16 の置き換え、biweekly の 2 回。終日の予定は終日のまま
	if got := skipReasons(p); got[calendar.SkipStaffOnLeave] != 9 || got[calendar.SkipAllDay] != 1 || len(got) != 2 {
		t.Errorf("取り込まない理由 = %v, want staff_on_leave 9 件と all_day 1 件", got)
	}
	for _, s := range p.Skipped {
		if s.Reason == calendar.SkipStaffOnLeave && (s.Date == nil || s.StartTime == nil || s.EndTime == nil) {
			t.Errorf("休職の取り込まない予定 = %+v, want 日時を持つ", s)
		}
	}

	res, err := e.uc.Import(e.ctx, calID, e.rng, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.ImportedCount != 0 || res.Run.SkippedCount != 10 {
		t.Errorf("Run = %+v, want 取り込み 0 件、取り込まない 10 件", res.Run)
	}
	if len(e.store.Schedules) != 0 || len(e.store.Links) != 0 || len(e.store.Infos) != 0 {
		t.Errorf("休職の職員に書いた: 予定 %d、対応 %d、訪問の情報 %d", len(e.store.Schedules), len(e.store.Links), len(e.store.Infos))
	}

	setLeave(e.store, false)
	again, err := e.uc.Preview(e.ctx, calID, e.rng)
	if err != nil {
		t.Fatal(err)
	}
	if again.Counts.Import != 6 || skipReasons(again)[calendar.SkipStaffOnLeave] != 0 {
		t.Errorf("復職した後の Counts = %+v, want 休職の前と同じ 6 件", again.Counts)
	}
}

// 休職の職員の、前の取り込みで繰り返しのまま取り込んだ予定の、取り消した回と変えた回は、今と同じく当てる（#278 の検証の観点 4）。
func TestImportAppliesLinkedChangesWhileStaffOnLeave(t *testing.T) {
	srv := fixture()
	e := newEnv(t, srv)
	if _, err := e.importDecided(t, e.rng, decisions()); err != nil {
		t.Fatal(err)
	}
	setLeave(e.store, true)
	srv.Calendars[googleCalID] = [][]*calendarv3.Event{{
		grecurring(gevent("weekly", "【訪看I2】利用者A", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00"),
			"RRULE:FREQ=WEEKLY;BYDAY=MO"),
		gcancelled("weekly_20261207", "weekly", "2026-12-07T09:00:00+09:00"),
		gexception("weekly_20261214", "weekly", "【訪看I2】利用者A", "2026-12-14T11:00:00+09:00", "2026-12-14T11:30:00+09:00", "2026-12-14T09:00:00+09:00"),
		gevent("newdec", "会議", "2026-12-03T13:00:00+09:00", "2026-12-03T14:00:00+09:00"),
	}}
	dec, err := calendar.NewRange(civil.Date{Year: 2026, Month: 12, Day: 1}, civil.Date{Year: 2026, Month: 12, Day: 31})
	if err != nil {
		t.Fatal(err)
	}
	before := len(e.store.Schedules)
	res, err := e.importDecided(t, dec, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.ImportedCount != 1 || res.Run.SkippedCount != 1 {
		t.Errorf("Run = %+v, want 回の置き換え 1 件、休職で取り込まない 1 件", res.Run)
	}
	rs := recurringOf(t, e, "weekly")
	if !slices.Contains(rs.ExclusionDates, civil.Date{Year: 2026, Month: 12, Day: 7}) || !slices.Contains(rs.ExclusionDates, civil.Date{Year: 2026, Month: 12, Day: 14}) {
		t.Errorf("除外の日 = %v", rs.ExclusionDates)
	}
	if moved := scheduleOf(t, e, "weekly_20261214"); moved.RecurringScheduleID == nil || *moved.RecurringScheduleID != rs.ID || moved.StaffID != inmem.StaffID {
		t.Errorf("置き換え = %+v", moved)
	}
	if len(e.store.Schedules) != before+1 {
		t.Errorf("予定 %d 件 → %d 件, want 回の置き換えの 1 件だけ増える", before, len(e.store.Schedules))
	}
	for _, l := range e.store.Links {
		if l.ExternalEventID == "newdec" {
			t.Errorf("休職の職員の新しい予定を取り込んだ: %+v", l)
		}
	}
}

// lockHook は、LockStatuses の前に run を呼ぶ StaffRefs である。ロックを待つ間に、ほかのトランザクションが職員を書いて
// コミットしたことを表す。
type lockHook struct {
	inmem.StaffRefs
	run func()
}

func (h lockHook) LockStatuses(ctx context.Context, facilityID string) error {
	if h.run != nil {
		h.run()
	}
	return h.StaffRefs.LockStatuses(ctx, facilityID)
}

// 取り込みの読み替えの後に、職員が休職か退職になったとき、確定は何も書かない。退職と取り込みが同時に動いても、
// 退職した職員に予定ができない（#278）。
func TestImportRejectsWhenStaffStoppedAfterPlan(t *testing.T) {
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {{
		gevent("meeting", "会議", "2026-11-05T13:00:00+09:00", "2026-11-05T14:00:00+09:00"),
	}}}}
	tests := []struct {
		name string
		stop func(t *testing.T, s *inmem.Store)
		want error
	}{
		{"休職", func(_ *testing.T, s *inmem.Store) { setLeave(s, true) }, apperr.ErrConflict},
		{"退職", retire, apperr.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(t, srv)
			uc := withStaff(e, gcal.NewReader(gcaltest.Start(t, srv)),
				lockHook{StaffRefs: inmem.StaffRefs{Store: e.store}, run: func() { tt.stop(t, e.store) }})
			_, err := uc.Import(e.ctx, calID, e.rng, nil)
			if !errors.Is(err, tt.want) {
				t.Fatalf("err = %v, want %v", err, tt.want)
			}
			if len(e.store.Schedules)+len(e.store.Links) != 0 {
				t.Errorf("何か書いた: 予定 %d、対応 %d", len(e.store.Schedules), len(e.store.Links))
			}
		})
	}
}

// 退職した職員のカレンダーは、外したカレンダーと同じく、プレビューも取り込みもできない（#278 の検証の観点 1、2）。
func TestPreviewRejectsRetiredStaff(t *testing.T) {
	e := newEnv(t, fixture())
	retire(t, e.store)
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("退職で外したカレンダー: err = %v, want ErrNotFound", err)
	}

	// 退職でカレンダーを外すようにする前に退職にした職員のカレンダーが残っていても、取り込まない
	c := e.store.Calendars[calID]
	c.DisabledAt = nil
	e.store.Calendars[calID] = c
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("退職した職員の外していないカレンダー: err = %v, want ErrNotFound", err)
	}
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
	uc := withStaff(e, gcal.NewReader(gcaltest.Start(t, srv)),
		lockHook{StaffRefs: inmem.StaffRefs{Store: e.store}, run: func() { retire(t, e.store) }})
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

	syncer := newSyncer(e.exportEnv, gcal.NewReader(gcaltest.Start(t, e.srv)), &[]string{},
		lockHook{StaffRefs: inmem.StaffRefs{Store: e.store}, run: func() { retire(t, e.store) }})
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
		uc := calendar.NewUsecase(calendar.Deps{
			Calendars: inmem.Calendars{Store: s}, Accounts: oneAccount(gcal.NewReader(gcaltest.Start(t, e.srv)), nil),
			Exports: inmem.Exports{Store: s}, Schedules: inmem.Schedules{Store: s}, Types: inmem.ScheduleTypes{Store: s},
			Staff: lockHook{StaffRefs: inmem.StaffRefs{Store: s}, run: func() { retire(t, s) }},
		}, &inmem.Tx{}, &inmem.SeqIDs{}, principal.RequireStaffManage)
		_, err := uc.AcceptExport(e.ctx, exportID)
		check(t, e, scheduleID, err)
	})
}

// 休職の職員のカレンダーの、繰り返しの予定の変えた回でも、繰り返しの予定をほかの職員に割り振り直していれば、
// 休職の職員に新しい予定を作らない（#278）。
func TestImportWithholdsReplacementOfReassignedRecurring(t *testing.T) {
	srv := fixture()
	e := newEnv(t, srv)
	if _, err := e.importDecided(t, e.rng, decisions()); err != nil {
		t.Fatal(err)
	}
	rs := recurringOf(t, e, "weekly")
	rs.StaffID = inmem.CompanionID
	e.store.Recurring[rs.ID] = rs
	setLeave(e.store, true)
	srv.Calendars[googleCalID] = [][]*calendarv3.Event{{
		grecurring(gevent("weekly", "【訪看I2】利用者A", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00"),
			"RRULE:FREQ=WEEKLY;BYDAY=MO"),
		gexception("weekly_20261214", "weekly", "【訪看I2】利用者A", "2026-12-14T11:00:00+09:00", "2026-12-14T11:30:00+09:00", "2026-12-14T09:00:00+09:00"),
	}}
	dec, err := calendar.NewRange(civil.Date{Year: 2026, Month: 12, Day: 1}, civil.Date{Year: 2026, Month: 12, Day: 31})
	if err != nil {
		t.Fatal(err)
	}
	before := len(e.store.Schedules)
	p, err := e.uc.Preview(e.ctx, calID, dec)
	if err != nil {
		t.Fatal(err)
	}
	if got := skipReasons(p); got[calendar.SkipStaffOnLeave] != 1 || p.Counts.Import != 0 {
		t.Errorf("取り込まない理由 = %v, Counts = %+v, want 割り振り直した回の置き換えは staff_on_leave", got, p.Counts)
	}
	if _, err := e.importDecided(t, dec, nil); err != nil {
		t.Fatal(err)
	}
	if len(e.store.Schedules) != before {
		t.Errorf("予定 %d 件 → %d 件, want 休職の職員に新しい予定を作らない", before, len(e.store.Schedules))
	}
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
