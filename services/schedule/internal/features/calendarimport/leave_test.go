package calendarimport_test

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
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

func skipReasons(p calendarimport.ImportPreview) map[calendar.SkipReason]int {
	out := map[calendar.SkipReason]int{}
	for _, s := range p.SkippedItems {
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
	if p.Counts.Import != 0 || p.Counts.NeedsReview != 0 || p.Counts.Recurring != 0 || len(p.ReviewItems) != 0 {
		t.Errorf("Counts = %+v, want 取り込む予定と確認が必要な予定なし", p.Counts)
	}
	// visit、ambiguous、missing、meeting、nocode、weekly、weekly の 11-16 の置き換え、biweekly の 2 回。終日の予定は終日のまま
	if got := skipReasons(p); got[calendarimport.SkipStaffOnLeave] != 9 || got[calendar.SkipAllDay] != 1 || len(got) != 2 {
		t.Errorf("取り込まない理由 = %v, want staff_on_leave 9 件と all_day 1 件", got)
	}
	for _, s := range p.SkippedItems {
		if s.Reason == calendarimport.SkipStaffOnLeave && (s.Date == nil || s.StartTime == nil || s.EndTime == nil) {
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
	if again.Counts.Import != 6 || skipReasons(again)[calendarimport.SkipStaffOnLeave] != 0 {
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
	dec, err := calendarimport.NewRange(civil.Date{Year: 2026, Month: 12, Day: 1}, civil.Date{Year: 2026, Month: 12, Day: 31})
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

// lockHook は、2 回目の GetForShare（取り込みを書くトランザクションの始め）の前に run を呼ぶ FacilityLock である。
// ロックを待つ間に、ほかのトランザクションが職員を書いてコミットしたことを表す。1 回目は、取り込みの記録を作る前の確認である。
type lockHook struct {
	inmem.Facilities
	run   func()
	calls *int
}

func (h lockHook) GetForShare(ctx context.Context, facilityID string) (organization.Facility, error) {
	*h.calls++
	if h.run != nil && *h.calls == 2 {
		h.run()
	}
	return h.Facilities.GetForShare(ctx, facilityID)
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
			uc := withLocks(e, gcal.NewReader(gcaltest.Start(t, srv)),
				lockHook{Facilities: inmem.Facilities{Store: e.store}, run: func() { tt.stop(t, e.store) }, calls: new(int)})
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
	dec, err := calendarimport.NewRange(civil.Date{Year: 2026, Month: 12, Day: 1}, civil.Date{Year: 2026, Month: 12, Day: 31})
	if err != nil {
		t.Fatal(err)
	}
	before := len(e.store.Schedules)
	p, err := e.uc.Preview(e.ctx, calID, dec)
	if err != nil {
		t.Fatal(err)
	}
	if got := skipReasons(p); got[calendarimport.SkipStaffOnLeave] != 1 || p.Counts.Import != 0 {
		t.Errorf("取り込まない理由 = %v, Counts = %+v, want 割り振り直した回の置き換えは staff_on_leave", got, p.Counts)
	}
	if _, err := e.importDecided(t, dec, nil); err != nil {
		t.Fatal(err)
	}
	if len(e.store.Schedules) != before {
		t.Errorf("予定 %d 件 → %d 件, want 休職の職員に新しい予定を作らない", before, len(e.store.Schedules))
	}
}

// 訪問しない職員のカレンダーの取り込みでは、休職と同じく新しい予定を取り込まない予定に出し、確定しても作らない（ADR-0018、#377）。
func TestImportWithholdsNewEventsOfNonVisitingStaff(t *testing.T) {
	setNonVisiting := func(s *inmem.Store, on bool) {
		d := s.Staff[inmem.StaffID]
		d.NonVisiting = on
		s.Staff[inmem.StaffID] = d
	}
	e := newEnv(t, fixture())
	setNonVisiting(e.store, true)

	p, err := e.uc.Preview(e.ctx, calID, e.rng)
	if err != nil {
		t.Fatal(err)
	}
	if got := skipReasons(p); got[calendarimport.SkipStaffNonVisiting] != 9 || got[calendar.SkipAllDay] != 1 || len(got) != 2 {
		t.Errorf("取り込まない理由 = %v, want staff_non_visiting 9 件と all_day 1 件", got)
	}
	if _, err := e.uc.Import(e.ctx, calID, e.rng, nil); err != nil {
		t.Fatal(err)
	}
	if len(e.store.Schedules) != 0 || len(e.store.Infos) != 0 {
		t.Errorf("訪問しない職員に書いた: 予定 %d、訪問の情報 %d", len(e.store.Schedules), len(e.store.Infos))
	}

	setNonVisiting(e.store, false)
	if again, err := e.uc.Preview(e.ctx, calID, e.rng); err != nil || again.Counts.Import != 6 {
		t.Errorf("訪問する職員に戻した後の Counts = %+v, err = %v, want 6 件", again.Counts, err)
	}
}
