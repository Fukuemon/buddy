package inmem

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// Syncs は、calendarsync.SyncRepository のメモリ上の実装である。読む時刻と lease を持たず、取るたびに、事業所の予定の管理先が
// modes にある外していない全てのカレンダーを返す。
type Syncs struct{ *Store }

// Claim は、事業所の予定の管理先が modes にある外していないカレンダーを ID の順に max 件まで、最後に同期した結果のトークンを付けて返す。
func (s Syncs) Claim(_ context.Context, max int, _ time.Duration, modes []organization.SourceMode) ([]calendarsync.SyncState, error) {
	var out []calendarsync.SyncState
	for _, c := range s.Calendars {
		if !s.synced(c, modes) {
			continue
		}
		st := calendarsync.SyncState{Calendar: c, LastStatus: calendarsync.SyncNever}
		if r, ok := s.SyncResults[c.ID]; ok {
			st.SyncToken, st.LastStatus, st.LastError = r.SyncToken, r.Status, r.ErrorCode
		}
		out = append(out, st)
	}
	slices.SortFunc(out, func(a, b calendarsync.SyncState) int { return strings.Compare(a.Calendar.ID, b.Calendar.ID) })
	return out[:min(max, len(out))], nil
}

// Finish は、calendarsync.SyncRepository の Finish を実装する。
func (s Syncs) Finish(_ context.Context, st calendarsync.SyncState, r calendarsync.SyncResult) error {
	s.SyncResults[st.Calendar.ID] = r
	if r.Synced {
		s.SyncedAt[st.Calendar.ID] = time.Now()
	}
	return nil
}

// Backlog は、calendarsync.SyncRepository の Backlog を実装する。メモリ上の実装は読む時刻と成功の時刻を持たないので、
// 事業所の予定の管理先が modes にある外していない全てのカレンダーを読む時刻を過ぎたものとして数え、最後の成功からの時間は 0 を返す。
func (s Syncs) Backlog(_ context.Context, modes []organization.SourceMode) (calendarsync.SyncBacklog, error) {
	var b calendarsync.SyncBacklog
	for _, c := range s.Calendars {
		if s.synced(c, modes) {
			b.OverdueCount++
		}
	}
	return b, nil
}

// synced は、カレンダー c を外しておらず、c の事業所の予定の管理先が modes にあるかを返す。
func (s Syncs) synced(c calendar.ExternalCalendar, modes []organization.SourceMode) bool {
	return c.DisabledAt == nil && slices.Contains(modes, s.Facilities[c.FacilityID].SourceMode)
}
