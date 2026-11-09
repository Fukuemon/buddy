package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarexport"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// CalendarExportRepository は、calendarexport.ExportRepository を実装する。
type CalendarExportRepository struct{ conn }

// NewCalendarExportRepository は CalendarExportRepository を作る。
func NewCalendarExportRepository(pool *pgxpool.Pool) *CalendarExportRepository {
	return &CalendarExportRepository{conn{pool}}
}

var _ calendarexport.ExportRepository = (*CalendarExportRepository)(nil)

func toExport(e sqlcgen.CalendarExport) calendar.Export {
	out := calendar.Export{
		ID: e.ID,
		Target: calendar.Target{
			FacilityID:          e.FacilityID,
			ScheduleID:          deref(e.ScheduleID),
			RecurringScheduleID: deref(e.RecurringScheduleID),
			DeletedScheduleID:   deref(e.DeletedScheduleID),
		},
		Status:        calendar.ExportStatus(e.Status),
		Revision:      int(e.Revision),
		Attempts:      int(e.Attempts),
		Overwrite:     e.Overwrite,
		NextAttemptAt: e.NextAttemptAt,
		LockedUntil:   e.LockedUntil,
		CreatedAt:     e.CreatedAt,
		UpdatedAt:     e.UpdatedAt,
	}
	if e.ErrorCode != nil {
		c := calendar.ExportErrorCode(*e.ErrorCode)
		out.ErrorCode = &c
	}
	return out
}

// Enqueue は、t の終わっていない待ちを積み直すか、ID が id の待ちを足す。
func (r *CalendarExportRepository) Enqueue(ctx context.Context, id string, t calendar.Target) error {
	if t.DeletedScheduleID != "" {
		return translate("enqueue deleted schedule export", r.q(ctx).EnqueueDeletedScheduleExport(ctx, sqlcgen.EnqueueDeletedScheduleExportParams{
			ID: id, FacilityID: t.FacilityID, DeletedScheduleID: &t.DeletedScheduleID,
		}))
	}
	if t.ScheduleID != "" {
		return translate("enqueue schedule export", r.q(ctx).EnqueueScheduleExport(ctx, sqlcgen.EnqueueScheduleExportParams{
			ID: id, FacilityID: t.FacilityID, ScheduleID: &t.ScheduleID,
		}))
	}
	return translate("enqueue recurring schedule export", r.q(ctx).EnqueueRecurringScheduleExport(ctx, sqlcgen.EnqueueRecurringScheduleExportParams{
		ID: id, FacilityID: t.FacilityID, RecurringScheduleID: &t.RecurringScheduleID,
	}))
}

// Claim は、書く時刻を過ぎた pending の待ちを max 件まで取る。
func (r *CalendarExportRepository) Claim(ctx context.Context, max int, lease time.Duration) ([]calendar.Export, error) {
	n, err := int32Of(max)
	if err != nil {
		return nil, err
	}
	rows, err := r.q(ctx).ClaimCalendarExports(ctx, sqlcgen.ClaimCalendarExportsParams{LeaseSeconds: lease.Seconds(), MaxCount: n})
	if err != nil {
		return nil, translate("claim calendar exports", err)
	}
	out := make([]calendar.Export, len(rows))
	for i, e := range rows {
		out[i] = toExport(e)
	}
	return out, nil
}

// Finish は、待ち e を書いた結果 res を書く。書いている間に積み直された待ちは数え直し、ほかの処理が取り直した待ちは変えない。
func (r *CalendarExportRepository) Finish(ctx context.Context, e calendar.Export, res calendar.ExportResult) error {
	rev, err := int32Of(e.Revision)
	if err != nil {
		return err
	}
	attempts, err := int32Of(e.Attempts)
	if err != nil {
		return err
	}
	if res.Released {
		return translate("unclaim calendar export", r.q(ctx).UnclaimCalendarExport(ctx, sqlcgen.UnclaimCalendarExportParams{ID: e.ID, Attempts: attempts}))
	}
	var n int64
	if res.Status == calendar.ExportSucceeded {
		n, err = r.q(ctx).SucceedCalendarExport(ctx, sqlcgen.SucceedCalendarExportParams{ID: e.ID, Revision: rev, Attempts: attempts})
	} else {
		var code *string
		if res.ErrorCode != nil {
			code = ptr(string(*res.ErrorCode))
		}
		n, err = r.q(ctx).FailCalendarExport(ctx, sqlcgen.FailCalendarExportParams{
			ID: e.ID, Revision: rev, Attempts: attempts, Status: string(res.Status), ErrorCode: code, RetryAfterSeconds: res.RetryAfter.Seconds(),
		})
	}
	if err != nil {
		return translate("finish calendar export", err)
	}
	if n > 0 {
		return nil
	}
	return translate("release calendar export", r.q(ctx).ReleaseCalendarExport(ctx, sqlcgen.ReleaseCalendarExportParams{ID: e.ID, Attempts: attempts}))
}

// Get は、ID が id の待ちを返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarExportRepository) Get(ctx context.Context, id string) (calendar.Export, error) {
	e, err := r.q(ctx).GetCalendarExport(ctx, id)
	if err != nil {
		return calendar.Export{}, translate("get calendar export", err)
	}
	return toExport(e), nil
}

// ListIssues は、事業所の確認が必要な待ちを、新しく変わった順に返す。
func (r *CalendarExportRepository) ListIssues(ctx context.Context, facilityID string) ([]calendar.ExportIssue, error) {
	rows, err := r.q(ctx).ListCalendarExportIssues(ctx, facilityID)
	if err != nil {
		return nil, translate("list calendar export issues", err)
	}
	out := make([]calendar.ExportIssue, len(rows))
	for i, row := range rows {
		start, end, err := slotTimes(row.StartTime, row.EndTime)
		if err != nil {
			return nil, err
		}
		out[i] = calendar.ExportIssue{
			Export: toExport(sqlcgen.CalendarExport{
				ID: row.ID, FacilityID: row.FacilityID, ScheduleID: row.ScheduleID, RecurringScheduleID: row.RecurringScheduleID,
				Status: row.Status, Revision: row.Revision, Attempts: row.Attempts, NextAttemptAt: row.NextAttemptAt,
				Overwrite: row.Overwrite, ErrorCode: row.ErrorCode, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
			}),
			Cancelled:   row.Cancelled,
			StaffID:     row.StaffID,
			StaffName:   row.StaffName,
			Date:        civil.DateOf(row.Date),
			StartTime:   start,
			EndTime:     end,
			EndsNextDay: row.EndsNextDay,
		}
	}
	return out, nil
}

// Retry は、確認が必要な待ち id を、buddy の内容で書き直す pending の待ちにする。確認が必要な待ちでなければ apperr.ErrConflict を返す。
func (r *CalendarExportRepository) Retry(ctx context.Context, id string) error {
	n, err := r.q(ctx).RetryCalendarExport(ctx, id)
	if err != nil {
		return translate("retry calendar export", err)
	}
	if n == 0 {
		return apperr.ErrConflict
	}
	return nil
}

// Open は、t の終わっていない待ちを返す。無いときは apperr.ErrNotFound を返す。
func (r *CalendarExportRepository) Open(ctx context.Context, t calendar.Target) (calendar.Export, error) {
	var (
		e   sqlcgen.CalendarExport
		err error
	)
	switch {
	case t.ScheduleID != "":
		e, err = r.q(ctx).GetOpenScheduleExport(ctx, &t.ScheduleID)
	default:
		e, err = r.q(ctx).GetOpenRecurringScheduleExport(ctx, &t.RecurringScheduleID)
	}
	if err != nil {
		return calendar.Export{}, translate("get open calendar export", err)
	}
	return toExport(e), nil
}

// Backlog は、書いていない待ちの数と、最も古い待ちを足してからの時間を返す。
func (r *CalendarExportRepository) Backlog(ctx context.Context) (calendarexport.Backlog, error) {
	row, err := r.q(ctx).CalendarExportBacklog(ctx)
	if err != nil {
		return calendarexport.Backlog{}, translate("calendar export backlog", err)
	}
	return calendarexport.Backlog{PendingCount: int(row.PendingCount), OldestAge: secondsOf(row.OldestAgeSeconds)}, nil
}
