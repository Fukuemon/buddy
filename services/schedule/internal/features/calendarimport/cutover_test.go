package calendarimport_test

import (
	"errors"
	"slices"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// cutoverEnv は、Google カレンダーを予定の正本にする事業所の、切り替えのテストの環境である。
// カレンダーの最後の同期は成功していて、事業所の Projection に 1 行ある。
type cutoverEnv struct {
	env
	srv *gcaltest.Server
}

func newCutoverEnv(t *testing.T, srv *gcaltest.Server) cutoverEnv {
	t.Helper()
	e := newEnv(t, srv)
	f := e.store.Facilities[inmem.FacilityID]
	f.SourceMode = organization.SourceGooglePrimary
	e.store.Facilities[inmem.FacilityID] = f
	e.store.Staff[inmem.StaffID] = withName(e.store, inmem.StaffID, "青木 陽菜")
	c := cutoverEnv{env: e, srv: srv}
	c.synced(time.Now().Add(-time.Hour))
	e.store.Projections[inmem.ProjectionKey{ExternalCalendarID: calID, EventID: "visit"}] = scheduleview.Projection{
		ExternalCalendarID: calID, EventID: "visit", FacilityID: inmem.FacilityID, StaffID: inmem.StaffID,
	}
	return c
}

// synced は、カレンダーの最後の同期が時刻 at に成功したことにする。
func (c cutoverEnv) synced(at time.Time) {
	c.store.SyncResults[calID] = calendarsync.SyncResult{Status: calendarsync.SyncSucceeded}
	c.store.SyncedAt[calID] = at
}

func withName(s *inmem.Store, id, name string) staff.Detail {
	d := s.Staff[id]
	d.Username = name
	return d
}

// cutoverRange は、cutoverNow に始めた切り替えの取り込みの期間である。
func cutoverRange() calendarimport.Range {
	return calendarimport.Range{Start: civil.Date{Year: 2026, Month: 11, Day: 1}}
}

// cutoverDecisions は、fixture の確認が必要な予定の取り込み方である。隔週の繰り返しは規則に写せないので、取り込まない。
func cutoverDecisions() []calendarimport.Decision {
	return append(decisions(), calendarimport.Decision{ExternalEventID: "biweekly", Action: calendarimport.ActionSkip})
}

func (c cutoverEnv) start(t *testing.T) calendarimport.Cutover {
	t.Helper()
	cut, err := c.uc.StartCutover(c.ctx, inmem.FacilityID)
	if err != nil {
		t.Fatal(err)
	}
	return cut
}

func (c cutoverEnv) importAll(t *testing.T, ds []calendarimport.Decision) calendarimport.ImportResult {
	t.Helper()
	res, err := c.importDecided(t, cutoverRange(), ds)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func requireIncomplete(t *testing.T, err error, want ...calendarimport.UnmetReason) []calendarimport.Unmet {
	t.Helper()
	var ie *calendarimport.IncompleteError
	if !errors.As(err, &ie) || !errors.Is(err, apperr.ErrConflict) {
		t.Fatalf("err = %v, want IncompleteError", err)
	}
	var got []calendarimport.UnmetReason
	for _, it := range ie.Items {
		got = append(got, it.Reason)
	}
	if !slices.Equal(got, want) {
		t.Fatalf("満たさない理由 = %v, want %v（%+v）", got, want, ie.Items)
	}
	return ie.Items
}

func (c cutoverEnv) requireStillOpen(t *testing.T, id string) {
	t.Helper()
	if cut := c.store.Cutovers[id]; cut.Status != calendarimport.CutoverOpen {
		t.Errorf("切り替え = %+v, want open のまま", cut)
	}
	if f := c.store.Facilities[inmem.FacilityID]; f.SourceMode != organization.SourceGooglePrimary {
		t.Errorf("モード = %s, want google_primary のまま", f.SourceMode)
	}
	if len(c.store.Projections) == 0 {
		t.Error("Projection の行が消えた")
	}
}

// TestCutover は、切り替えを始め、切り替えの期間で取り込み、同期の後に完了すると、事業所が buddy を予定の正本にし、
// Projection の行を消し、切り替えを completed にすることを確認する（ADR-0028）。
func TestCutover(t *testing.T) {
	c := newCutoverEnv(t, fixture())
	cut := c.start(t)
	if cut.Status != calendarimport.CutoverOpen || cut.RangeStart != (civil.Date{Year: 2026, Month: 11, Day: 1}) || cut.StartedBy != inmem.StaffID {
		t.Fatalf("始めた切り替え = %+v", cut)
	}

	p, err := c.uc.Preview(c.ctx, calID, cutoverRange())
	if err != nil {
		t.Fatal(err)
	}
	// 隔週の繰り返しは、回に展開せず、規則に写せない確認が必要な予定にする
	if got := reviewIDs(p.ReviewItems); !slices.Equal(got, []string{"ambiguous", "biweekly", "missing"}) {
		t.Fatalf("確認が必要な予定 = %v", got)
	}
	if r := p.ReviewItems[1]; r.Reason != calendarimport.ReviewRecurrenceUnsupported || r.Recurrence != nil {
		t.Errorf("写せない繰り返し = %+v", r)
	}
	if p.Counts.RecurringExpanded != 0 || p.Counts.ExpandedOccurrences != 0 || len(c.srv.Queries()) == 0 {
		t.Errorf("件数 = %+v, want 回に展開しない", p.Counts)
	}

	res := c.importAll(t, cutoverDecisions())
	if res.Run.CutoverID == nil || *res.Run.CutoverID != cut.ID || res.Run.RangeEnd != (civil.Date{}) || res.Run.RangeStart != cut.RangeStart {
		t.Errorf("取り込みの記録 = %+v, want 切り替えを持ち、終わりの無い期間", res.Run)
	}
	for _, l := range c.store.Links {
		if l.CutoverID == nil || *l.CutoverID != cut.ID {
			t.Errorf("%s の対応の切り替え = %v", l.ExternalEventID, l.CutoverID)
		}
	}
	if rs := recurringOf(t, c.env, "weekly"); rs.Rule.EndDate != nil {
		t.Errorf("終わりの無い繰り返し = %+v", rs.Rule)
	}

	// 取り込みの後に同期が成功していないので、まだ完了できない
	_, err = c.uc.CompleteCutover(c.ctx, cut.ID)
	requireIncomplete(t, err, calendarimport.UnmetSyncStale)
	c.requireStillOpen(t, cut.ID)

	c.synced(time.Now().Add(time.Minute))
	done, err := c.uc.CompleteCutover(c.ctx, cut.ID)
	if err != nil {
		t.Fatal(err)
	}
	if done.Status != calendarimport.CutoverCompleted || done.FinishedAt == nil {
		t.Errorf("完了した切り替え = %+v", done)
	}
	f := c.store.Facilities[inmem.FacilityID]
	if f.SourceMode != organization.SourceBuddyPrimary || schedule.RequireWritable(f) != nil {
		t.Errorf("モード = %s, want buddy_primary", f.SourceMode)
	}
	if len(c.store.Projections) != 0 {
		t.Errorf("Projection の行 = %d, want 0", len(c.store.Projections))
	}
	if _, err := c.uc.CompleteCutover(c.ctx, cut.ID); !isConflict(err, calendarimport.CodeCutoverNotOpen) {
		t.Errorf("2 回目の完了: err = %v, want %s", err, calendarimport.CodeCutoverNotOpen)
	}
}

// TestCompleteCutoverRejects は、完了の 3 つの確認のどれかを満たさないと、満たさない予定の一覧を返し、何も書かずに open のままにすることを確認する。
func TestCompleteCutoverRejects(t *testing.T) {
	t.Run("最後の取り込みの後に同期が成功していない", func(t *testing.T) {
		c := newCutoverEnv(t, fixture())
		cut := c.start(t)
		c.importAll(t, cutoverDecisions())
		_, err := c.uc.CompleteCutover(c.ctx, cut.ID)
		items := requireIncomplete(t, err, calendarimport.UnmetSyncStale)
		if items[0].ExternalCalendarID != calID || items[0].StaffName != "青木 陽菜" {
			t.Errorf("満たさないカレンダー = %+v", items[0])
		}
		c.requireStillOpen(t, cut.ID)
	})
	t.Run("カレンダーを取り込んでいない", func(t *testing.T) {
		c := newCutoverEnv(t, fixture())
		cut := c.start(t)
		_, err := c.uc.CompleteCutover(c.ctx, cut.ID)
		requireIncomplete(t, err, calendarimport.UnmetNotImported)
		c.requireStillOpen(t, cut.ID)
	})
	t.Run("取り込んだ後に Google で作った予定と取り消した回がある", func(t *testing.T) {
		c := newCutoverEnv(t, fixture())
		cut := c.start(t)
		c.importAll(t, cutoverDecisions())
		c.srv.Put(googleCalID, gevent("added", "会議", "2026-12-10T13:00:00+09:00", "2026-12-10T14:00:00+09:00"))
		c.srv.Put(googleCalID, &calendarv3.Event{
			Id: "weekly_20261123", Status: "cancelled", RecurringEventId: "weekly",
			OriginalStartTime: &calendarv3.EventDateTime{DateTime: "2026-11-23T09:00:00+09:00"},
		})
		c.synced(time.Now().Add(time.Minute))
		_, err := c.uc.CompleteCutover(c.ctx, cut.ID)
		items := requireIncomplete(t, err, calendarimport.UnmetEventNotImported, calendarimport.UnmetEventNotImported)
		// 日時の順に並ぶ
		if *items[0].Date != (civil.Date{Year: 2026, Month: 11, Day: 23}) {
			t.Errorf("取り消した回 = %+v", items[0])
		}
		if items[1].ExternalEventID != "added" || *items[1].Date != (civil.Date{Year: 2026, Month: 12, Day: 10}) {
			t.Errorf("作った予定 = %+v", items[1])
		}
		c.requireStillOpen(t, cut.ID)
	})
	t.Run("取り込んだ後に確認が必要な予定が変わった", func(t *testing.T) {
		c := newCutoverEnv(t, fixture())
		cut := c.start(t)
		ds := []calendarimport.Decision{
			{ExternalEventID: "ambiguous", Action: calendarimport.ActionPatient, PatientID: "PB2"},
			{ExternalEventID: "missing", Action: calendarimport.ActionSkip},
			{ExternalEventID: "biweekly", Action: calendarimport.ActionSkip},
		}
		c.importAll(t, ds)
		c.srv.Edit(googleCalID, "missing", func(ev *calendarv3.Event) { ev.Summary = "【訪看I2】利用者Y" })
		c.synced(time.Now().Add(time.Minute))
		_, err := c.uc.CompleteCutover(c.ctx, cut.ID)
		items := requireIncomplete(t, err, calendarimport.UnmetNeedsReview)
		if items[0].ExternalEventID != "missing" || items[0].ReviewReason != calendarimport.ReviewPatientNotFound {
			t.Errorf("確認が必要な予定 = %+v", items[0])
		}
	})
	t.Run("取り込んだ後に Google で予定が変わったか消えた", func(t *testing.T) {
		c := newCutoverEnv(t, fixture())
		cut := c.start(t)
		c.importAll(t, cutoverDecisions())
		c.srv.Edit(googleCalID, "visit", func(ev *calendarv3.Event) {
			ev.Start.DateTime, ev.End.DateTime = "2026-11-02T11:00:00+09:00", "2026-11-02T11:30:00+09:00"
		})
		c.srv.Delete(googleCalID, "meeting")
		c.synced(time.Now().Add(time.Minute))
		_, err := c.uc.CompleteCutover(c.ctx, cut.ID)
		items := requireIncomplete(t, err, calendarimport.UnmetChanged, calendarimport.UnmetDeleted)
		if items[0].ExternalEventID != "visit" || *items[0].StartTime != (civil.Time{Hour: 11}) {
			t.Errorf("変わった予定 = %+v, want Google の今の日時", items[0])
		}
		if items[1].ExternalEventID != "meeting" {
			t.Errorf("消えた予定 = %+v", items[1])
		}
		c.requireStillOpen(t, cut.ID)
	})
}

// TestImportDuringCutoverOverwrites は、切り替えの間に取り込み直すと、取り込んだ後に Google で変わったか消えた予定の buddy の写しを消し、
// Google の今の内容で取り込み直すことを確認する。繰り返しの親が変わったときは、親と回の全てを取り込み直す。取り込み直すと完了できる。
func TestImportDuringCutoverOverwrites(t *testing.T) {
	c := newCutoverEnv(t, fixture())
	cut := c.start(t)
	c.importAll(t, cutoverDecisions())
	before := scheduleOf(t, c.env, "visit")
	oldRecurring := recurringOf(t, c.env, "weekly")

	c.srv.Edit(googleCalID, "visit", func(ev *calendarv3.Event) {
		ev.Start.DateTime, ev.End.DateTime = "2026-11-02T11:00:00+09:00", "2026-11-02T11:30:00+09:00"
	})
	c.srv.Edit(googleCalID, "weekly", func(ev *calendarv3.Event) {
		ev.Recurrence = []string{"RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T000000Z"}
	})
	c.srv.Delete(googleCalID, "meeting")

	p, err := c.uc.Preview(c.ctx, calID, cutoverRange())
	if err != nil {
		t.Fatal(err)
	}
	if p.Counts.Overwrite != 3 {
		t.Errorf("上書きする予定 = %d, want 3", p.Counts.Overwrite)
	}
	// 前の取り込みで取り込んだ予定は確認が必要な予定に出ないので、写せない繰り返しの取り込み方だけを送る
	c.importAll(t, cutoverDecisions()[2:])

	after := scheduleOf(t, c.env, "visit")
	if after.ID == before.ID || after.StartTime != (civil.Time{Hour: 11}) {
		t.Errorf("変わった予定 = %+v, want Google の今の 11:00 で取り込み直す", after.Slot)
	}
	if _, ok := c.store.Schedules[before.ID]; ok {
		t.Error("前の写しが残った")
	}
	if l := linkOf(t, c.env, "visit"); l.ETag == `"visit"` {
		t.Errorf("対応の etag = %s, want Google の今の etag", l.ETag)
	}
	rs := recurringOf(t, c.env, "weekly")
	if rs.ID == oldRecurring.ID || rs.Rule.EndDate == nil || *rs.Rule.EndDate != (civil.Date{Year: 2026, Month: 12, Day: 31}) {
		t.Errorf("繰り返し = %+v, want 終了日のある規則で取り込み直す", rs.Rule)
	}
	if _, ok := c.store.Recurring[oldRecurring.ID]; ok {
		t.Error("前の繰り返しの予定が残った")
	}
	if moved := scheduleOf(t, c.env, "weekly_20261116"); moved.RecurringScheduleID == nil || *moved.RecurringScheduleID != rs.ID {
		t.Errorf("回の置き換え = %+v, want 取り込み直した繰り返しを指す", moved)
	}
	for _, l := range c.store.Links {
		if l.ExternalEventID == "meeting" {
			t.Error("Google で消えた予定の対応が残った")
		}
	}

	c.synced(time.Now().Add(time.Minute))
	if _, err := c.uc.CompleteCutover(c.ctx, cut.ID); err != nil {
		t.Fatalf("取り込み直した後の完了: err = %v", err)
	}
}

// TestCutoverRestoredOccurrence は、取り込んだ後に、取り消した回を Google で戻すと、完了を拒み、
// 取り込み直すとその回を単発の予定として取り込んで完了できることを確認する。取り消した回は除外する日だけになり、予定の対応を持たないので、
// 前の取り込みで除外したことを、取り込んだことと見なさない。
func TestCutoverRestoredOccurrence(t *testing.T) {
	c := newCutoverEnv(t, fixture())
	cut := c.start(t)
	c.importAll(t, cutoverDecisions())
	c.srv.Put(googleCalID, gexception("weekly_20261109", "weekly", "【訪看I2】利用者A",
		"2026-11-09T09:00:00+09:00", "2026-11-09T09:30:00+09:00", "2026-11-09T09:00:00+09:00"))
	c.synced(time.Now().Add(time.Minute))

	_, err := c.uc.CompleteCutover(c.ctx, cut.ID)
	items := requireIncomplete(t, err, calendarimport.UnmetEventNotImported)
	if items[0].ExternalEventID != "weekly_20261109" || *items[0].Date != (civil.Date{Year: 2026, Month: 11, Day: 9}) {
		t.Errorf("戻した回 = %+v", items[0])
	}
	c.requireStillOpen(t, cut.ID)

	c.importAll(t, cutoverDecisions()[2:])
	if s := scheduleOf(t, c.env, "weekly_20261109"); s.Date != (civil.Date{Year: 2026, Month: 11, Day: 9}) || s.StartTime != (civil.Time{Hour: 9}) {
		t.Errorf("戻した回の予定 = %+v", s.Slot)
	}
	c.synced(time.Now().Add(2 * time.Minute))
	if _, err := c.uc.CompleteCutover(c.ctx, cut.ID); err != nil {
		t.Fatalf("取り込み直した後の完了: err = %v", err)
	}
}

// TestCancelCutover は、切り替えをやめると、この切り替えの取り込みで作った予定、繰り返しの予定、訪問の情報、予定の対応を消し、
// 事業所を google_primary のままにして、切り替えを canceled にすることを確認する。やめた後は、取り込みを拒む。
func TestCancelCutover(t *testing.T) {
	c := newCutoverEnv(t, fixture())
	seeded := inmem.Seeded()
	cut := c.start(t)
	c.importAll(t, cutoverDecisions())
	if len(c.store.Links) == 0 || len(c.store.Infos) == 0 {
		t.Fatal("取り込んでいない")
	}
	done, err := c.uc.CancelCutover(c.ctx, cut.ID)
	if err != nil {
		t.Fatal(err)
	}
	if done.Status != calendarimport.CutoverCanceled || done.FinishedAt == nil {
		t.Errorf("やめた切り替え = %+v", done)
	}
	if len(c.store.Links) != 0 || len(c.store.Schedules) != len(seeded.Schedules) || len(c.store.Recurring) != len(seeded.Recurring) || len(c.store.Infos) != 0 {
		t.Errorf("対応 %d、予定 %d、繰り返し %d、訪問の情報 %d, want 取り込んだものを全て消す",
			len(c.store.Links), len(c.store.Schedules), len(c.store.Recurring), len(c.store.Infos))
	}
	if f := c.store.Facilities[inmem.FacilityID]; f.SourceMode != organization.SourceGooglePrimary || len(c.store.Projections) == 0 {
		t.Errorf("モード = %s、Projection %d, want google_primary のまま", f.SourceMode, len(c.store.Projections))
	}
	if _, err := c.uc.Import(c.ctx, calID, cutoverRange(), cutoverDecisions()); !isConflict(err, schedule.CodeGooglePrimary) {
		t.Errorf("やめた後の取り込み: err = %v, want %s", err, schedule.CodeGooglePrimary)
	}
	if _, err := c.uc.CancelCutover(c.ctx, cut.ID); !isConflict(err, calendarimport.CodeCutoverNotOpen) {
		t.Errorf("2 回目: err = %v", err)
	}
	// やめた後に、もう一度始められる
	if _, err := c.uc.StartCutover(c.ctx, inmem.FacilityID); err != nil {
		t.Errorf("やめた後に始める: err = %v", err)
	}
}

// TestStartCutoverRejects は、切り替えを始められない 3 つの場合を確認する。
func TestStartCutoverRejects(t *testing.T) {
	t.Run("open の切り替えが 1 つの事業所に 2 つできない", func(t *testing.T) {
		c := newCutoverEnv(t, fixture())
		c.start(t)
		if _, err := c.uc.StartCutover(c.ctx, inmem.FacilityID); !isConflict(err, calendarimport.CodeCutoverOpen) {
			t.Errorf("err = %v, want %s", err, calendarimport.CodeCutoverOpen)
		}
		if len(c.store.Cutovers) != 1 {
			t.Errorf("切り替え = %d 件, want 1", len(c.store.Cutovers))
		}
	})
	t.Run("buddy を予定の正本にしている", func(t *testing.T) {
		e := newEnv(t, fixture())
		if _, err := e.uc.StartCutover(e.ctx, inmem.FacilityID); !isConflict(err, calendarimport.CodeCutoverNotGooglePrimary) {
			t.Errorf("err = %v, want %s", err, calendarimport.CodeCutoverNotGooglePrimary)
		}
	})
	t.Run("最後の同期が成功していないカレンダーがある", func(t *testing.T) {
		c := newCutoverEnv(t, fixture())
		c.store.SyncResults[calID] = calendarsync.SyncResult{Status: calendarsync.SyncFailed}
		_, err := c.uc.StartCutover(c.ctx, inmem.FacilityID)
		if !isConflict(err, calendarimport.CodeCutoverSyncNotReady) {
			t.Errorf("err = %v, want %s", err, calendarimport.CodeCutoverSyncNotReady)
		}
	})
	t.Run("職員の管理の権限が無い", func(t *testing.T) {
		c := newCutoverEnv(t, fixture())
		if _, err := c.uc.StartCutover(t.Context(), inmem.FacilityID); !errors.Is(err, apperr.ErrForbidden) {
			t.Errorf("err = %v, want ErrForbidden", err)
		}
	})
}

// TestImportDuringCutoverRejects は、切り替えの間の取り込みの期間と、規則に写せない繰り返しの取り込み方の誤りを、何も書かずに拒むことを確認する。
func TestImportDuringCutoverRejects(t *testing.T) {
	c := newCutoverEnv(t, fixture())
	c.start(t)
	if _, err := c.importDecided(t, c.rng, cutoverDecisions()); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("終わりのある期間: err = %v, want ErrInvalidInput", err)
	}
	ds := append(decisions(), calendarimport.Decision{ExternalEventID: "biweekly", Action: calendarimport.ActionNormal})
	if _, err := c.importDecided(t, cutoverRange(), ds); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("写せない繰り返しを通常の予定にする: err = %v, want ErrInvalidInput", err)
	}
	if len(c.store.Links) != 0 {
		t.Errorf("対応を書いた: %d", len(c.store.Links))
	}
}

// TestGetCutover は、切り替えの状況が、open の切り替えと、カレンダーごとの同期とこの切り替えの最後の取り込みを返すことを確認する。
func TestGetCutover(t *testing.T) {
	c := newCutoverEnv(t, fixture())
	st, err := c.uc.GetCutover(c.ctx, inmem.FacilityID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Cutover != nil || len(st.Calendars) != 1 || st.Calendars[0].LastImport != nil || st.Calendars[0].Sync.StaffName != "青木 陽菜" {
		t.Fatalf("始める前の状況 = %+v", st)
	}
	cut := c.start(t)
	res := c.importAll(t, cutoverDecisions())
	st, err = c.uc.GetCutover(c.ctx, inmem.FacilityID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Cutover == nil || st.Cutover.ID != cut.ID || st.Calendars[0].LastImport == nil || st.Calendars[0].LastImport.ID != res.Run.ID {
		t.Errorf("取り込んだ後の状況 = %+v", st)
	}
}

// putPending は、事業所に、予定の API が Google に書いた結果が分からない保留の版の記録を置く。
func (c cutoverEnv) putPending() {
	c.store.Records["PENDING"] = calendar.EventRecord{
		ScheduleID: "PENDING", FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: "pending",
		Pending: &calendar.PendingWrite{Version: 1, State: calendar.PendingUnknown, Deadline: time.Now()},
	}
}

// TestCutoverRejectsPendingWrites は、予定の API の保留の版の記録がある事業所では、切り替えを始める操作と完了する操作が
// google_write_pending を返して何も書かず、保留の版が解けた後は始められて完了できることを確認する（ADR-0028）。
func TestCutoverRejectsPendingWrites(t *testing.T) {
	c := newCutoverEnv(t, fixture())
	c.putPending()
	if _, err := c.uc.StartCutover(c.ctx, inmem.FacilityID); !isConflict(err, calendarimport.CodeWritePending) {
		t.Fatalf("始める: err = %v, want %s", err, calendarimport.CodeWritePending)
	}
	if len(c.store.Cutovers) != 0 {
		t.Fatalf("切り替え = %d 件, want 0", len(c.store.Cutovers))
	}
	delete(c.store.Records, "PENDING")
	cut := c.start(t)
	c.importAll(t, cutoverDecisions())
	c.synced(time.Now().Add(time.Minute))

	c.putPending()
	if _, err := c.uc.CompleteCutover(c.ctx, cut.ID); !isConflict(err, calendarimport.CodeWritePending) {
		t.Fatalf("完了: err = %v, want %s", err, calendarimport.CodeWritePending)
	}
	c.requireStillOpen(t, cut.ID)
	if _, ok := c.store.Records["PENDING"]; !ok {
		t.Error("409 の完了で記録が消えた")
	}
	delete(c.store.Records, "PENDING")
	if _, err := c.uc.CompleteCutover(c.ctx, cut.ID); err != nil {
		t.Fatalf("保留の版が解けた後の完了: err = %v", err)
	}
}

// TestCutoverImportUsesRecordVisit は、予定の API の記録が訪問の情報を持つ予定を、切り替えの取り込みが、タイトルの読み替えではなく
// 記録の訪問の情報（同行者と訪問の区分を含む）で訪問の予定にし、記録の訪問の情報を写した別の訪問の情報を作ることを確認する。
// タイトルの利用者名（利用者Z）が記録の利用者と食い違っても、記録の訪問の情報を使い、確認が必要な予定にしない。
func TestCutoverImportUsesRecordVisit(t *testing.T) {
	c := newCutoverEnv(t, fixture())
	companion := inmem.CompanionID
	recorded := visit.Info{
		ID: "RECORDVISIT", FacilityID: inmem.FacilityID, PatientID: inmem.PatientID, AssignedStaffID: inmem.StaffID,
		CompanionID: &companion, ServiceCodeID: codeI2, CategoryIDs: []string{inmem.CategoryID},
	}
	c.store.Infos[recorded.ID] = recorded
	c.store.Records["RECORD"] = calendar.EventRecord{
		ScheduleID: "RECORD", FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: "missing",
		VisitInfoID: &recorded.ID, Version: 1,
	}
	cut := c.start(t)
	p, err := c.uc.Preview(c.ctx, calID, cutoverRange())
	if err != nil {
		t.Fatal(err)
	}
	if got := reviewIDs(p.ReviewItems); !slices.Equal(got, []string{"ambiguous", "biweekly"}) {
		t.Fatalf("確認が必要な予定 = %v, want 記録のある missing を含まない", got)
	}
	c.importAll(t, []calendarimport.Decision{
		{ExternalEventID: "ambiguous", Action: calendarimport.ActionPatient, PatientID: "PB2"},
		{ExternalEventID: "biweekly", Action: calendarimport.ActionSkip},
	})
	sc := scheduleOf(t, c.env, "missing")
	if sc.VisitInfoID == nil || *sc.VisitInfoID == recorded.ID {
		t.Fatalf("予定の訪問の情報 = %v, want 記録とは別の訪問の情報", sc.VisitInfoID)
	}
	got := c.store.Infos[*sc.VisitInfoID]
	if got.PatientID != recorded.PatientID || got.AssignedStaffID != recorded.AssignedStaffID || got.CompanionID == nil ||
		*got.CompanionID != companion || got.ServiceCodeID != codeI2 || !slices.Equal(got.CategoryIDs, recorded.CategoryIDs) {
		t.Errorf("訪問の情報 = %+v, want 記録の訪問の情報 %+v を写したもの", got, recorded)
	}
	if _, ok := c.store.Infos[recorded.ID]; !ok {
		t.Error("取り込みで記録の訪問の情報が消えた")
	}

	// 完了すると、記録と記録だけが指していた訪問の情報を消し、予定が指す写した訪問の情報は残す
	c.synced(time.Now().Add(time.Minute))
	if _, err := c.uc.CompleteCutover(c.ctx, cut.ID); err != nil {
		t.Fatal(err)
	}
	if len(c.store.Records) != 0 {
		t.Errorf("記録 = %d 件, want 0", len(c.store.Records))
	}
	if _, ok := c.store.Infos[recorded.ID]; ok {
		t.Error("記録だけが指していた訪問の情報が残った")
	}
	if _, ok := c.store.Infos[*sc.VisitInfoID]; !ok {
		t.Error("予定が指す訪問の情報が消えた")
	}
}

func isConflict(err error, code string) bool {
	var ce *apperr.ConflictError
	return errors.As(err, &ce) && ce.Code == code
}
