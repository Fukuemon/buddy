package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/postgres/sqlcgen"
)

// CalendarSyncRepository は、calendar.SyncRepository を実装する。
type CalendarSyncRepository struct{ conn }

// NewCalendarSyncRepository は CalendarSyncRepository を作る。
func NewCalendarSyncRepository(pool *pgxpool.Pool) *CalendarSyncRepository {
	return &CalendarSyncRepository{conn{pool}}
}

var _ calendar.SyncRepository = (*CalendarSyncRepository)(nil)

// Claim は、同期の状態の行が無いカレンダーに行を足してから、読む時刻を過ぎた外していないカレンダーを max 件まで取る。
func (r *CalendarSyncRepository) Claim(ctx context.Context, max int, lease time.Duration) ([]calendar.SyncState, error) {
	n, err := int32Of(max)
	if err != nil {
		return nil, err
	}
	if err := r.q(ctx).EnsureCalendarSyncStates(ctx); err != nil {
		return nil, translate("ensure calendar sync states", err)
	}
	rows, err := r.q(ctx).ClaimCalendarSyncs(ctx, sqlcgen.ClaimCalendarSyncsParams{LeaseSeconds: lease.Seconds(), MaxCount: n})
	if err != nil {
		return nil, translate("claim calendar syncs", err)
	}
	out := make([]calendar.SyncState, len(rows))
	for i, row := range rows {
		out[i] = calendar.SyncState{
			Calendar: calendar.ExternalCalendar{
				ID: row.ID, FacilityID: row.FacilityID, StaffID: row.StaffID, Provider: row.Provider, CalendarID: row.CalendarID,
			},
			SyncToken:  deref(row.SyncToken),
			LastStatus: calendar.SyncStatus(row.LastStatus),
		}
		if row.LockedUntil != nil {
			out[i].LockedUntil = *row.LockedUntil
		}
	}
	return out, nil
}

// Finish は、s を同期した結果 res を書く。ほかの処理が取り直したカレンダーは変えない。
func (r *CalendarSyncRepository) Finish(ctx context.Context, s calendar.SyncState, res calendar.SyncResult) error {
	var token, code *string
	if res.SyncToken != "" {
		token = &res.SyncToken
	}
	if res.ErrorCode != nil {
		code = ptr(string(*res.ErrorCode))
	}
	_, err := r.q(ctx).FinishCalendarSync(ctx, sqlcgen.FinishCalendarSyncParams{
		SyncToken: token, LastStatus: string(res.Status), LastError: code, AfterSeconds: res.After.Seconds(),
		ExternalCalendarID: s.Calendar.ID, LockedUntil: &s.LockedUntil,
	})
	return translate("finish calendar sync", err)
}
