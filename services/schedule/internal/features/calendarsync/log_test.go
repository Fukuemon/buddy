package calendarsync_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// loggingSyncer は、e の Store の上で、Debug から JSON のログを logs に書く同期の処理を作る。
func loggingSyncer(t *testing.T, e syncEnv, logs *bytes.Buffer) *calendarsync.Syncer {
	t.Helper()
	source := gcal.NewReader(gcaltest.Start(t, e.srv))
	s := e.store
	return calendarsync.NewSyncer(calendarsync.SyncerDeps{
		Syncs: inmem.Syncs{Store: s}, Calendars: inmem.Calendars{Store: s}, Staff: inmem.StaffRefs{Store: s},
		Locks:   inmem.Facilities{Store: s},
		Sources: func(context.Context, string) (calendar.EventSource, error) { return source, nil },
	}, testAppliers(s), &inmem.Tx{}, time.Minute, slog.New(slog.NewJSONHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
}

// loggedLine は、ログ logs のうち msg の最後の行を返す。行が無ければテストを止める。
func loggedLine(t *testing.T, logs *bytes.Buffer, msg string) map[string]any {
	t.Helper()
	var last map[string]any
	dec := json.NewDecoder(bytes.NewReader(logs.Bytes()))
	for dec.More() {
		var line map[string]any
		if err := dec.Decode(&line); err != nil {
			t.Fatal(err)
		}
		if line["msg"] == msg {
			last = line
		}
	}
	if last == nil {
		t.Fatalf("%q のログが無い:\n%s", msg, logs)
	}
	return last
}

func wantCounts(t *testing.T, line map[string]any, want map[string]float64) {
	t.Helper()
	for k, v := range want {
		if line[k] != v {
			t.Errorf("%s の %s = %v, want %v", line["msg"], k, line[k], v)
		}
	}
}

func TestSyncLogsBatchAndBacklog(t *testing.T) {
	e := newSyncEnv(t)
	// 2 つ目のカレンダーは、サービスアカウントに共有されておらず読めない
	e.store.Calendars["CAL2"] = calendar.ExternalCalendar{
		ID: "CAL2", FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Provider: calendar.ProviderGoogle, CalendarID: "unshared@example.com",
	}
	logs := &bytes.Buffer{}
	if _, err := loggingSyncer(t, e, logs).SyncDue(t.Context()); err != nil {
		t.Fatal(err)
	}
	batch := loggedLine(t, logs, "calendar sync batch")
	wantCounts(t, batch, map[string]float64{"claimed_count": 2, "succeeded_count": 1, "failed_count": 1, "held_count": 0, "requeued_count": 0})
	if ms, ok := batch["duration_ms"].(float64); !ok || ms < 0 {
		t.Errorf("duration_ms = %v", batch["duration_ms"])
	}
	backlog := loggedLine(t, logs, "calendar sync backlog")
	// メモリ上の実装は、外していない全てのカレンダーを読む時刻を過ぎたものとして数える
	wantCounts(t, backlog, map[string]float64{"overdue_count": 2, "oldest_success_age_seconds": 0})
	if bytes.Contains(logs.Bytes(), []byte("unshared@example.com")) || bytes.Contains(logs.Bytes(), []byte(googleCalID)) {
		t.Errorf("ログにカレンダーの ID のメールを書いた:\n%s", logs)
	}
}

func TestSyncLogsRequeuedOnShutdown(t *testing.T) {
	e := newSyncEnv(t)
	logs := &bytes.Buffer{}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, _ = loggingSyncer(t, e, logs).SyncDue(ctx)
	wantCounts(t, loggedLine(t, logs, "calendar sync batch"), map[string]float64{"claimed_count": 1, "requeued_count": 1, "succeeded_count": 0})
	if bytes.Contains(logs.Bytes(), []byte("calendar sync backlog")) {
		t.Error("止めた後に滞留を数えた")
	}
}
