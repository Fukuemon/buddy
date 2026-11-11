package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// CalendarSyncRepository は、calendarsync.SyncRepository を実装する。
type CalendarSyncRepository struct{ conn }

// NewCalendarSyncRepository は CalendarSyncRepository を作る。
func NewCalendarSyncRepository(pool *pgxpool.Pool) *CalendarSyncRepository {
	return &CalendarSyncRepository{conn{pool}}
}

var _ calendarsync.SyncRepository = (*CalendarSyncRepository)(nil)

// Claim は、同期の状態の行が無いカレンダーに行を足してから、事業所の予定の管理先が modes にあり、読む時刻を過ぎた
// 外していないカレンダーを max 件まで取る。
func (r *CalendarSyncRepository) Claim(ctx context.Context, max int, lease time.Duration, modes []organization.SourceMode) ([]calendarsync.SyncState, error) {
	n, err := int32Of(max)
	if err != nil {
		return nil, err
	}
	if err := r.q(ctx).EnsureCalendarSyncStates(ctx); err != nil {
		return nil, translate("ensure calendar sync states", err)
	}
	rows, err := r.q(ctx).ClaimCalendarSyncs(ctx, sqlcgen.ClaimCalendarSyncsParams{LeaseSeconds: lease.Seconds(), MaxCount: n, Modes: modeStrings(modes)})
	if err != nil {
		return nil, translate("claim calendar syncs", err)
	}
	out := make([]calendarsync.SyncState, len(rows))
	for i, row := range rows {
		out[i] = calendarsync.SyncState{
			Calendar: calendar.ExternalCalendar{
				ID: row.ID, FacilityID: row.FacilityID, StaffID: row.StaffID, Provider: row.Provider, CalendarID: row.CalendarID,
			},
			SyncToken:  deref(row.SyncToken),
			LastStatus: calendarsync.SyncStatus(row.LastStatus),
		}
		if row.LastError != nil {
			code := calendarsync.SyncErrorCode(*row.LastError)
			out[i].LastError = &code
		}
		if row.LockedUntil != nil {
			out[i].LockedUntil = *row.LockedUntil
		}
	}
	return out, nil
}

// Finish は、s を同期した結果 res を書く。ほかの処理が取り直したカレンダーは変えない。
func (r *CalendarSyncRepository) Finish(ctx context.Context, s calendarsync.SyncState, res calendarsync.SyncResult) error {
	var token, code *string
	if res.SyncToken != "" {
		token = &res.SyncToken
	}
	if res.ErrorCode != nil {
		code = ptr(string(*res.ErrorCode))
	}
	_, err := r.q(ctx).FinishCalendarSync(ctx, sqlcgen.FinishCalendarSyncParams{
		SyncToken: token, LastStatus: string(res.Status), LastError: code, Synced: res.Synced, AfterSeconds: res.After.Seconds(),
		ExternalCalendarID: s.Calendar.ID, LockedUntil: &s.LockedUntil,
	})
	return translate("finish calendar sync", err)
}

// Backlog は、事業所の予定の管理先が modes にある、読む時刻を過ぎた外していないカレンダーの数と、最も古い最後の成功からの時間を返す。
func (r *CalendarSyncRepository) Backlog(ctx context.Context, modes []organization.SourceMode) (calendarsync.SyncBacklog, error) {
	row, err := r.q(ctx).CalendarSyncBacklog(ctx, modeStrings(modes))
	if err != nil {
		return calendarsync.SyncBacklog{}, translate("calendar sync backlog", err)
	}
	return calendarsync.SyncBacklog{OverdueCount: int(row.OverdueCount), OldestSuccessAge: secondsOf(row.OldestSuccessAgeSeconds)}, nil
}

// modeStrings は、予定の管理先を、クエリに渡す文字列の配列にする。
func modeStrings(modes []organization.SourceMode) []string {
	out := make([]string, len(modes))
	for i, m := range modes {
		out[i] = string(m)
	}
	return out
}

// secondsOf は、DB が返した秒数 s を time.Duration にする。
func secondsOf(s float64) time.Duration {
	return time.Duration(s * float64(time.Second))
}
