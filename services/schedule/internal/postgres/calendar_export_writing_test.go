package postgres

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// このファイルのテストは、書き出しが Google に予定を作っている間か、作った後で予定の対応を書く前に、予定を変えたときに、
// 前のカレンダーに Google の予定が残らないことを確認する（#964）。

const (
	aokiCalendar   = "aoki@example.com"
	aokiCalendarID = "01M3TD000000000000000000W1"
)

// beforeInsert は、最初の Insert を外部に送る前に before を 1 度だけ呼ぶ calendar.EventWriter である。
// 書き出しが Google に予定を作っている間に、予定の API が予定を変えたときと同じにする。
type beforeInsert struct {
	calendar.EventWriter
	before func()
	once   sync.Once
}

func (w *beforeInsert) Insert(ctx context.Context, calendarID, eventID string, b calendar.EventBody) (calendar.Event, error) {
	w.once.Do(w.before)
	return w.EventWriter.Insert(ctx, calendarID, eventID, b)
}

// writingEnv は、森と青木に Google カレンダーを結び付け、森の単発の予定を 1 つ積んだデータベースと、2 つのカレンダーのフェイクである。
type writingEnv struct {
	pool       *pgxpool.Pool
	srv        *gcaltest.Server
	scheduleID string
}

func newWritingEnv(t *testing.T, name string) writingEnv {
	t.Helper()
	pool := workerDB(t, name)
	linkMoriCalendar(t, pool)
	err := NewCalendarRepository(pool).Create(context.Background(), calendar.ExternalCalendar{
		ID: aokiCalendarID, FacilityID: seedFacility, StaffID: seedAoki, Provider: calendar.ProviderGoogle, CalendarID: aokiCalendar,
	})
	if err != nil {
		t.Fatal(err)
	}
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{workerCalendar: {}, aokiCalendar: {}}}
	return writingEnv{pool: pool, srv: srv, scheduleID: enqueueMoriSchedules(t, pool, 1)[0]}
}

func (e writingEnv) exporter(t *testing.T, w calendar.EventWriter, calendars calendarexport.ExporterCalendars) *calendarexport.Exporter {
	t.Helper()
	if w == nil {
		w = gcal.NewWriter(gcaltest.Start(t, e.srv))
	}
	if calendars == nil {
		calendars = NewCalendarRepository(e.pool)
	}
	return calendarexport.NewExporter(calendarexport.ExporterDeps{
		Facilities: NewFacilityRepository(e.pool),
		Exports:    NewCalendarExportRepository(e.pool), Calendars: calendars,
		Writers:   func(context.Context, string) (calendar.EventWriter, error) { return w, nil },
		Schedules: NewScheduleRepository(e.pool), Recurring: NewRecurringScheduleRepository(e.pool), Deletions: NewScheduleRepository(e.pool),
	}, ulid.Generator{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// changeStaff は、予定の職員を staffID に替えて、書き出しの待ちを積む。予定の変更（schedule.Update）と同じ行を書く。
func (e writingEnv) changeStaff(t *testing.T, staffID string) {
	t.Helper()
	ctx := context.Background()
	if _, err := e.pool.Exec(ctx, "UPDATE schedules SET staff_id = $2, version = version + 1 WHERE id = $1", e.scheduleID, staffID); err != nil {
		t.Fatal(err)
	}
	if err := NewCalendarExportRepository(e.pool).Enqueue(ctx, ulid.Generator{}.NewID(), calendar.Target{FacilityID: seedFacility, ScheduleID: e.scheduleID}); err != nil {
		t.Fatal(err)
	}
}

// remove は、予定を削除し、削除の書き出しの待ちを積む。予定の削除（schedule.Delete）と同じ行を書く。
func (e writingEnv) remove(t *testing.T, staffID string) {
	t.Helper()
	ctx := context.Background()
	err := NewScheduleRepository(e.pool).Delete(ctx, schedule.Deletion{
		ID: ulid.Generator{}.NewID(), FacilityID: seedFacility, ScheduleID: e.scheduleID,
		Date: civil.Date{Year: 2026, Month: 11, Day: 4}, StaffID: staffID, DeletedBy: seedMori,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := NewCalendarExportRepository(e.pool).Enqueue(ctx, ulid.Generator{}.NewID(), calendar.Target{FacilityID: seedFacility, DeletedScheduleID: e.scheduleID}); err != nil {
		t.Fatal(err)
	}
}

// drain は、書く時刻を過ぎた待ちが無くなるまで書く。書き直しを待つ待ちも、書く時刻を今にして書く。
func (e writingEnv) drain(t *testing.T, x *calendarexport.Exporter) {
	t.Helper()
	ctx := context.Background()
	for range 10 {
		if _, err := e.pool.Exec(ctx, "UPDATE calendar_exports SET next_attempt_at = now() WHERE status = 'pending'"); err != nil {
			t.Fatal(err)
		}
		n, err := x.ExportDue(ctx)
		if err != nil {
			t.Logf("ExportDue: %v", err)
		}
		if n == 0 {
			return
		}
	}
	t.Fatal("待ちが 10 回で書き終わらない")
}

// live は、カレンダー calendarID に残っている、予定の Google の予定を返す。無いか消されていれば nil である。
func (e writingEnv) live(t *testing.T, calendarID string) *calendarv3.Event {
	t.Helper()
	ev := e.srv.Event(calendarID, eventIDOf(t, e.scheduleID))
	if ev == nil || ev.Status == "cancelled" {
		return nil
	}
	return ev
}

// TestCalendarExportDeleteWhileCreating は、書き出しが森のカレンダーに最初の作成を書いている間に予定を削除しても、
// 書き出しが終わった後に、どのカレンダーにも Google の予定が残らないことを確認する。
func TestCalendarExportDeleteWhileCreating(t *testing.T) {
	cases := []struct {
		name string
		// during は、書き出しが森のカレンダーに作成を送る前に、予定の API が行う操作である。
		during func(t *testing.T, e writingEnv)
	}{
		{"職員を青木に替えてから削除する", func(t *testing.T, e writingEnv) {
			e.changeStaff(t, seedAoki)
			e.remove(t, seedAoki)
		}},
		{"削除し、作成が届く前にほかの処理が削除の待ちを書く", func(t *testing.T, e writingEnv) {
			e.remove(t, seedMori)
			e.drain(t, e.exporter(t, nil, nil))
		}},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := newWritingEnv(t, fmt.Sprintf("worker_export_delete_while_creating_%d", i))
			w := &beforeInsert{EventWriter: gcal.NewWriter(gcaltest.Start(t, e.srv))}
			w.before = func() { tc.during(t, e) }
			e.drain(t, e.exporter(t, w, nil))
			if ev := e.live(t, workerCalendar); ev != nil {
				t.Errorf("森のカレンダーに削除した予定が残った: %s", ev.Summary)
			}
			if ev := e.live(t, aokiCalendar); ev != nil {
				t.Errorf("青木のカレンダーに削除した予定が残った: %s", ev.Summary)
			}
		})
	}
}

// TestCalendarExportMovesEventAfterLinkFailure は、書き出しが森のカレンダーに予定を作った後で予定の対応を書けずに止まり、
// その後に予定の職員を青木に替えたときに、森のカレンダーに予定を残さず、青木のカレンダーに作ることを確認する。
func TestCalendarExportMovesEventAfterLinkFailure(t *testing.T) {
	e := newWritingEnv(t, "worker_export_moves_after_link_failure")
	failing := &failOnceLinks{CalendarRepository: NewCalendarRepository(e.pool)}
	if _, err := e.exporter(t, nil, failing).ExportDue(context.Background()); err != nil {
		t.Logf("1 回目の ExportDue: %v", err)
	}
	if e.live(t, workerCalendar) == nil {
		t.Fatal("1 回目で森のカレンダーに予定が作られていない")
	}
	e.changeStaff(t, seedAoki)
	expireLeases(t, e.pool)
	e.drain(t, e.exporter(t, nil, nil))
	if ev := e.live(t, workerCalendar); ev != nil {
		t.Errorf("森のカレンダーに前の職員の予定が残った: %s", ev.Summary)
	}
	if e.live(t, aokiCalendar) == nil {
		t.Error("青木のカレンダーに予定が無い")
	}
	l, err := NewCalendarRepository(e.pool).LinkBySchedule(context.Background(), e.scheduleID)
	if err != nil || l.ExternalCalendarID != aokiCalendarID {
		t.Errorf("予定の対応 = %+v, %v, want 青木のカレンダー", l, err)
	}
}
