package calendarexport_test

import (
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// このファイルのテストは、書き出しが外部の予定を作った後で予定の対応を書けずに止まった待ち（WritingCalendarID を持ち、対応が無い）を、
// 次に書くときに、作ろうとしたカレンダーの予定を残さずに書くことを確認する（#964）。

// strand は、予定 d の待ちが職員のカレンダー（calID）に外部の予定を作った後で、予定の対応を書けずに止まった状態にする。
func (e exportEnv) strand(t *testing.T, d schedule.Schedule) {
	t.Helper()
	x := e.export(t, d.ID)
	x.WritingCalendarID = calID
	e.store.Exports[x.ID] = x
	e.srv.Put(googleCalID, gevent(eventID(t, d.ID), "作った予定", "2026-11-04T10:00:00+09:00", "2026-11-04T11:00:00+09:00"))
}

func (e exportEnv) linkCompanion() {
	e.store.Calendars["CAL2"] = calendar.ExternalCalendar{ID: "CAL2", FacilityID: inmem.FacilityID, StaffID: inmem.CompanionID, Provider: calendar.ProviderGoogle, CalendarID: otherGoogleCalID}
}

// live は、カレンダー calendarID に、予定 id の消されていない外部の予定があるかを返す。
func (e exportEnv) live(t *testing.T, calendarID, id string) bool {
	t.Helper()
	ev := e.srv.Event(calendarID, eventID(t, id))
	return ev != nil && ev.Status != "cancelled"
}

func TestExportClearsStrandedEvent(t *testing.T) {
	cases := []struct {
		name string
		// change は、止まった待ちの後に、予定の API が行う操作である。
		change func(t *testing.T, e exportEnv, d schedule.Schedule)
		// keep は、書き出しの後に、前の職員のカレンダーに予定が残るかである。
		keep bool
		// moved は、書き出しの後に、替えた職員のカレンダーに予定があるかである。
		moved bool
	}{
		{"職員を替えると、前の職員のカレンダーから消して、替えた職員のカレンダーに作る", func(t *testing.T, e exportEnv, d schedule.Schedule) {
			e.update(t, d.ID, "担当を替えた", inmem.CompanionID)
		}, false, true},
		{"予定をキャンセルすると、作ろうとしたカレンダーから消す", func(t *testing.T, e exportEnv, d schedule.Schedule) {
			if _, err := e.schedules.Cancel(e.ctx, d.ID, "中止"); err != nil {
				t.Fatal(err)
			}
		}, false, false},
		{"職員を替えてから削除すると、どちらのカレンダーからも消す", func(t *testing.T, e exportEnv, d schedule.Schedule) {
			e.update(t, d.ID, "担当を替えた", inmem.CompanionID)
			if err := e.schedules.Delete(e.ctx, d.ID); err != nil {
				t.Fatal(err)
			}
		}, false, false},
		{"職員を替えなければ、同じカレンダーの予定を書き直す", func(t *testing.T, e exportEnv, d schedule.Schedule) {
			e.update(t, d.ID, "時刻を変えた", inmem.StaffID)
		}, true, false},
		{"作ろうとしたカレンダーを外していれば、その予定は消さない", func(t *testing.T, e exportEnv, d schedule.Schedule) {
			c := e.store.Calendars[calID]
			now := time.Now()
			c.DisabledAt = &now
			e.store.Calendars[calID] = c
			e.update(t, d.ID, "担当を替えた", inmem.CompanionID)
		}, true, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := newExportEnv(t)
			e.linkCompanion()
			d := e.create(t, "カンファレンス")
			e.strand(t, d)
			tc.change(t, e, d)
			e.due()
			e.run(t)
			if got := e.live(t, googleCalID, d.ID); got != tc.keep {
				t.Errorf("前の職員のカレンダーに予定がある = %v, want %v", got, tc.keep)
			}
			if got := e.live(t, otherGoogleCalID, d.ID); got != tc.moved {
				t.Errorf("替えた職員のカレンダーに予定がある = %v, want %v", got, tc.moved)
			}
			for _, x := range e.store.Exports {
				if x.Status != calendar.ExportSucceeded || x.WritingCalendarID != "" {
					t.Errorf("待ち = %+v, want 書き終えて、作ろうとしたカレンダーを空にする", x)
				}
			}
		})
	}
}
