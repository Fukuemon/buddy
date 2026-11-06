package calendarsync_test

import (
	"context"
	"net/http"
	"strconv"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// このファイルのテストは、予定の API が Google カレンダーに書いた予定の保留の版を、同期の増分が確定し、
// 書く期限を過ぎた保留の版を読み戻しが確定するか消すことを確認する（ADR-0026）。

// pendingNow は、読み戻しが書く期限と比べる時刻である。
var pendingNow = time.Date(2099, 11, 1, 9, 0, 0, 0, time.UTC)

// 訪問の情報の ID。
const (
	confirmedVisit = "VISIT_CONFIRMED"
	pendingVisit   = "VISIT_PENDING"
)

// pendingEnv は、google_primary の事業所で、読み戻しの時刻を pendingNow にした同期の処理である。
type pendingEnv struct {
	projectionEnv
	scheduleID string
	eventID    string
}

func newPendingEnv(t *testing.T) pendingEnv {
	t.Helper()
	e := newProjectionEnv(t)
	deps := syncerDeps(e.store, gcal.NewReader(gcaltest.Start(t, e.srv)), e.sources, inmem.Facilities{Store: e.store})
	deps.Now = func() time.Time { return pendingNow }
	e.syncer = calendarsync.NewSyncer(deps, testAppliers(e.store), &inmem.Tx{}, time.Minute, discardLog)
	id := ulid.Generator{}.NewID()
	eventID, err := calendar.EventIDOf(id)
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range []string{confirmedVisit, pendingVisit} {
		e.store.Infos[v] = visit.Info{ID: v, FacilityID: inmem.FacilityID, PatientID: inmem.PatientID, AssignedStaffID: inmem.StaffID}
	}
	return pendingEnv{projectionEnv: e, scheduleID: id, eventID: eventID}
}

// putRecord は、確定した版 version の記録に、版 version+1 の保留の版を state と書く期限 deadline で持たせる。
// version が 0 なら確定した訪問の情報を持たせず、confirmedVisit を消す。保留の版の訪問の情報は pendingVisit である。
func (e pendingEnv) putRecord(version int, state calendar.PendingState, deadline time.Time) {
	r := calendar.EventRecord{
		ScheduleID: e.scheduleID, FacilityID: inmem.FacilityID, ExternalCalendarID: calID, ExternalEventID: e.eventID, Version: version,
		Pending: &calendar.PendingWrite{Version: version + 1, State: state, VisitInfoID: ptr(pendingVisit), Deadline: deadline},
	}
	if version > 0 {
		r.VisitInfoID = ptr(confirmedVisit)
	} else {
		delete(e.store.Infos, confirmedVisit)
	}
	e.store.Records[e.scheduleID] = r
}

// putEvent は、Google カレンダーに、記録の予定を、buddy の予定の ID と版 version を付けて置く。
func (e pendingEnv) putEvent(version int) *calendarv3.Event {
	ev := gevent(e.eventID, "【訪看I2】利用者A", "2099-11-04T13:00:00+09:00", "2099-11-04T14:00:00+09:00")
	ev.Updated = "2099-10-30T08:00:00Z"
	ev.ExtendedProperties = &calendarv3.EventExtendedProperties{Private: map[string]string{
		calendar.PropScheduleID: e.scheduleID, calendar.PropVersion: strconv.Itoa(version),
	}}
	e.srv.Put(googleCalID, ev)
	return ev
}

func (e pendingEnv) readBack(t *testing.T) int {
	t.Helper()
	n, err := e.syncer.ReadBackDue(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func (e pendingEnv) record() (calendar.EventRecord, bool) {
	r, ok := e.store.Records[e.scheduleID]
	return r, ok
}

func (e pendingEnv) hasVisit(id string) bool {
	_, ok := e.store.Infos[id]
	return ok
}

func ptr[T any](v T) *T { return &v }

// isConfirmed は、記録が版 version で確定し、訪問の情報が pendingVisit で、保留の版が無いかを返す。
func (e pendingEnv) isConfirmed(version int) bool {
	r, ok := e.record()
	return ok && r.Version == version && r.Pending == nil && r.VisitInfoID != nil && *r.VisitInfoID == pendingVisit && e.hasVisit(pendingVisit)
}

// hasPending は、記録が版 version の保留の版を持ったままかを返す。
func (e pendingEnv) hasPending(version int) bool {
	r, ok := e.record()
	return ok && r.Pending != nil && r.Pending.Version == version && e.hasVisit(pendingVisit)
}

// TestSyncConfirmsPendingOfSameVersion は、同期の増分で読んだ予定の版が保留の版と同じなら、保留の版を確定し、
// 保留の訪問の情報を確定した訪問の情報に移して、前の訪問の情報を消すことを確認する。書く期限の前でも確定する。
func TestSyncConfirmsPendingOfSameVersion(t *testing.T) {
	for _, tc := range []struct {
		name    string
		version int
	}{
		{name: "作成", version: 0},
		{name: "確定した版がある", version: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := newPendingEnv(t)
			e.putRecord(tc.version, calendar.PendingWriting, pendingNow.Add(time.Minute))
			e.putEvent(tc.version + 1)
			e.sync(t)

			if !e.isConfirmed(tc.version + 1) {
				t.Errorf("記録 = %+v, want 版 %d で確定", e.store.Records[e.scheduleID], tc.version+1)
			}
			if e.hasVisit(confirmedVisit) {
				t.Error("前の訪問の情報が残った")
			}
			e.mustRow(t, e.eventID)
		})
	}
}

// TestSyncKeepsPendingOfOtherVersion は、同期の増分で読んだ予定の版が保留の版と違うときと、予定が取り消されているときに、
// 書く期限を過ぎていても保留の版を消さないことを確認する。増分の読み取りが、書き込みより前のことがあるためである。
func TestSyncKeepsPendingOfOtherVersion(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(e pendingEnv)
	}{
		{name: "前の版", edit: func(e pendingEnv) { e.putEvent(1) }},
		{name: "版が無い", edit: func(e pendingEnv) {
			ev := e.putEvent(2)
			e.srv.Edit(googleCalID, ev.Id, func(ev *calendarv3.Event) { delete(ev.ExtendedProperties.Private, calendar.PropVersion) })
		}},
		{name: "取り消し", edit: func(e pendingEnv) {
			e.putEvent(2)
			e.srv.Delete(googleCalID, e.eventID)
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := newPendingEnv(t)
			e.putRecord(1, calendar.PendingUnknown, pendingNow.Add(-time.Hour))
			tc.edit(e)
			e.sync(t)

			if r, _ := e.record(); !e.hasPending(2) || r.Version != 1 || !e.hasVisit(confirmedVisit) {
				t.Errorf("記録 = %+v, want 版 2 の保留の版を残す", r)
			}
		})
	}
}

// TestSyncDoesNotConfirmRecordOfOtherEvent は、予定の buddy の予定の ID の記録が、ほかの Google の予定の記録なら確定しないことを確認する。
func TestSyncDoesNotConfirmRecordOfOtherEvent(t *testing.T) {
	e := newPendingEnv(t)
	e.putRecord(0, calendar.PendingUnknown, pendingNow.Add(-time.Hour))
	ev := gevent("copied", "【訪看I2】利用者A", "2099-11-04T13:00:00+09:00", "2099-11-04T14:00:00+09:00")
	ev.ExtendedProperties = &calendarv3.EventExtendedProperties{Private: map[string]string{
		calendar.PropScheduleID: e.scheduleID, calendar.PropVersion: "1",
	}}
	e.srv.Put(googleCalID, ev)
	e.sync(t)

	if !e.hasPending(1) {
		t.Errorf("記録 = %+v, want 保留の版を残す", e.store.Records[e.scheduleID])
	}
}

// TestReadBackResolvesExpiredPending は、書く期限を過ぎた保留の版を、予定を読み戻して、予定が無ければ消し、版が同じなら確定し、
// 版が違うか取り消されていれば消すことを確認する。「書いている途中」の保留の版も、期限を過ぎていれば読み戻す。
// 確定した版の無い記録は記録ごと消し、確定した版のある記録は保留の版だけを消す。どちらも保留の訪問の情報を消す。
func TestReadBackResolvesExpiredPending(t *testing.T) {
	const (
		confirmed = "confirmed"
		rejected  = "rejected"
	)
	for _, tc := range []struct {
		name    string
		version int
		state   calendar.PendingState
		event   func(e pendingEnv)
		want    string
	}{
		{name: "作成で予定が無い", version: 0, state: calendar.PendingUnknown, event: func(pendingEnv) {}, want: rejected},
		{name: "確定した版があり予定が無い", version: 1, state: calendar.PendingUnknown, event: func(pendingEnv) {}, want: rejected},
		{name: "版が同じ", version: 0, state: calendar.PendingUnknown, event: func(e pendingEnv) { e.putEvent(1) }, want: confirmed},
		{name: "確定した版があり版が同じ", version: 1, state: calendar.PendingUnknown, event: func(e pendingEnv) { e.putEvent(2) }, want: confirmed},
		{name: "版が違う", version: 1, state: calendar.PendingUnknown, event: func(e pendingEnv) { e.putEvent(1) }, want: rejected},
		{name: "取り消し", version: 0, state: calendar.PendingUnknown, event: func(e pendingEnv) {
			e.putEvent(1)
			e.srv.Delete(googleCalID, e.eventID)
		}, want: rejected},
		{name: "書いている途中で版が同じ", version: 0, state: calendar.PendingWriting, event: func(e pendingEnv) { e.putEvent(1) }, want: confirmed},
		{name: "書いている途中で予定が無い", version: 0, state: calendar.PendingWriting, event: func(pendingEnv) {}, want: rejected},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := newPendingEnv(t)
			e.putRecord(tc.version, tc.state, pendingNow)
			tc.event(e)
			if n := e.readBack(t); n != 1 {
				t.Fatalf("取った数 = %d, want 1", n)
			}

			r, ok := e.record()
			switch {
			case tc.want == confirmed:
				if !e.isConfirmed(tc.version + 1) {
					t.Errorf("記録 = %+v, want 版 %d で確定", r, tc.version+1)
				}
				if p := e.mustRow(t, e.eventID); p.Title != "【訪看I2】利用者A" {
					t.Errorf("Projection の行 = %+v", p)
				}
			case tc.version == 0:
				if ok {
					t.Errorf("記録 = %+v, want 記録を消す", r)
				}
			default:
				if !ok || r.Pending != nil || r.Version != tc.version || r.VisitInfoID == nil || *r.VisitInfoID != confirmedVisit || !e.hasVisit(confirmedVisit) {
					t.Errorf("記録 = %+v, want 保留の版だけを消す", r)
				}
			}
			if tc.want == rejected && e.hasVisit(pendingVisit) {
				t.Error("保留の訪問の情報が残った")
			}
		})
	}
}

// TestReadBackSkipsPendingBeforeDeadline は、書く期限の前の保留の版を、状態によらず読み戻さないことを確認する。
func TestReadBackSkipsPendingBeforeDeadline(t *testing.T) {
	for _, state := range []calendar.PendingState{calendar.PendingWriting, calendar.PendingUnknown} {
		t.Run(string(state), func(t *testing.T) {
			e := newPendingEnv(t)
			e.putRecord(0, state, pendingNow.Add(time.Second))
			if n := e.readBack(t); n != 0 {
				t.Errorf("取った数 = %d, want 0", n)
			}
			if !e.hasPending(1) {
				t.Errorf("記録 = %+v, want 保留の版を残す", e.store.Records[e.scheduleID])
			}
		})
	}
}

// TestReadBackKeepsPendingWhenUnreadable は、予定を読めないときと、予定が無いと答えたがカレンダーも読めないときに、
// 保留の版を変えないことを確認する。Google はカレンダーを読めないときも 404 を返すためである。
func TestReadBackKeepsPendingWhenUnreadable(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(e pendingEnv)
	}{
		{name: "5xx", edit: func(e pendingEnv) { e.srv.Status = http.StatusServiceUnavailable }},
		{name: "カレンダーが無い", edit: func(e pendingEnv) { delete(e.srv.Calendars, googleCalID) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := newPendingEnv(t)
			e.putRecord(0, calendar.PendingUnknown, pendingNow)
			tc.edit(e)
			if n := e.readBack(t); n != 1 {
				t.Fatalf("取った数 = %d, want 1", n)
			}
			if !e.hasPending(1) {
				t.Errorf("記録 = %+v, want 保留の版を残す", e.store.Records[e.scheduleID])
			}
		})
	}
}

// TestReadBackKeepsPendingWhenNotSynced は、同期が当てないカレンダーの記録の保留の版を変えないことを確認する。
// カレンダーを外したときと事業所が buddy_primary のときは取らず、職員が退職したときは取っても変えない。
func TestReadBackKeepsPendingWhenNotSynced(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edit    func(e pendingEnv)
		claimed int
	}{
		{name: "カレンダーを外した", edit: func(e pendingEnv) {
			c := e.store.Calendars[calID]
			c.DisabledAt = &pendingNow
			e.store.Calendars[calID] = c
		}},
		{name: "buddy_primary", edit: func(e pendingEnv) { setSourceMode(e.store, organization.SourceBuddyPrimary) }},
		{name: "職員が退職した", edit: func(e pendingEnv) {
			st := e.store.Staff[inmem.StaffID]
			st.RetiredAt = &pendingNow
			e.store.Staff[inmem.StaffID] = st
		}, claimed: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := newPendingEnv(t)
			e.putRecord(0, calendar.PendingUnknown, pendingNow)
			tc.edit(e)
			if n := e.readBack(t); n != tc.claimed {
				t.Errorf("取った数 = %d, want %d", n, tc.claimed)
			}
			if !e.hasPending(1) {
				t.Errorf("記録 = %+v, want 保留の版を残す", e.store.Records[e.scheduleID])
			}
		})
	}
}

// resolvingSource は、予定を読んだ後に resolve を呼ぶ EventSource である。読み戻しの間に、予定の API の送り直しが保留の版を解いたときを作る。
type resolvingSource struct {
	calendar.EventSource
	resolve func()
}

func (s resolvingSource) Event(ctx context.Context, calendarID, eventID string) (calendar.Event, error) {
	ev, err := s.EventSource.Event(ctx, calendarID, eventID)
	s.resolve()
	return ev, err
}

// TestReadBackKeepsRecordResolvedMeanwhile は、読み戻しの間に、ほかの手順が保留の版を解いて次の版の保留の版を書いていれば、
// 読んだ予定で記録を変えないことを確認する。
func TestReadBackKeepsRecordResolvedMeanwhile(t *testing.T) {
	e := newPendingEnv(t)
	e.putRecord(0, calendar.PendingUnknown, pendingNow)
	source := resolvingSource{EventSource: gcal.NewReader(gcaltest.Start(t, e.srv)), resolve: func() {
		r := e.store.Records[e.scheduleID]
		r.Pending = &calendar.PendingWrite{Version: 2, State: calendar.PendingWriting, VisitInfoID: ptr(pendingVisit), Deadline: pendingNow.Add(time.Minute)}
		e.store.Records[e.scheduleID] = r
	}}
	deps := syncerDeps(e.store, source, e.sources, inmem.Facilities{Store: e.store})
	deps.Now = func() time.Time { return pendingNow }
	syncer := calendarsync.NewSyncer(deps, testAppliers(e.store), &inmem.Tx{}, time.Minute, discardLog)
	if _, err := syncer.ReadBackDue(t.Context()); err != nil {
		t.Fatal(err)
	}
	if !e.hasPending(2) {
		t.Errorf("記録 = %+v, want 次の版の保留の版を残す", e.store.Records[e.scheduleID])
	}
}
