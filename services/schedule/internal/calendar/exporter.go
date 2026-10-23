package calendar

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/schedule"
)

// 書き出しの処理の上限と間隔。
const (
	// exportBatch は、1 回に取る待ちの数の上限である。exportBatch 件を exportCallTimeout で書き終えても、exportLease を超えない数にする。
	exportBatch = 5
	// exportCallTimeout は、1 つの待ちを書く時間の上限である。
	exportCallTimeout = 20 * time.Second
	// exportLease は、取った待ちをほかの処理に渡さない時間である。
	exportLease = 2 * time.Minute
	// MaxExportAttempts は、一時的なエラーで書き直す回数の上限である。超えた待ちは failed にし、確認が必要な予定に出す。
	MaxExportAttempts = 5
	// exportBackoff は、最初に書き直すまでの時間である。書き直すたびに倍にする（30 秒、1 分、2 分、4 分）。
	exportBackoff = 30 * time.Second
)

// ExporterDeps は、Exporter が使うリポジトリと、外部のカレンダーに書く EventWriter を事業所ごとに返す Writers である。
type ExporterDeps struct {
	Exports   ExportRepository
	Calendars Repository
	Writers   WriterFor
	Schedules kernel.Finder[schedule.Detail]
	Recurring kernel.Finder[schedule.RecurringDetail]
}

// Exporter は、書き出しの待ちを、予定の職員が結び付けた外部のカレンダーに書く処理である。ADR-0009 の段階 2 に当たる。
// 待ちは予定の変更と同じトランザクションで積まれ（Outbox）、Exporter はトランザクションの外で外部のカレンダーを呼ぶ。
// 外部のカレンダーで変わった予定は buddy に当てず、確認が必要な待ち（conflict）にする。
type Exporter struct {
	deps ExporterDeps
	ids  kernel.IDGenerator
	log  *slog.Logger
}

// NewExporter は Exporter を作る。
func NewExporter(deps ExporterDeps, ids kernel.IDGenerator, log *slog.Logger) *Exporter {
	return &Exporter{deps: deps, ids: ids, log: log}
}

// Run は、ctx が終わるまで、interval ごとに ExportDue を呼ぶ。
func (x *Exporter) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		if _, err := x.ExportDue(ctx); err != nil && ctx.Err() == nil {
			x.log.ErrorContext(ctx, "calendar export", slog.Any("error", err))
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// ExportDue は、書く時刻を過ぎた待ちを取って書き、取った待ちの数を返す。1 つの待ちが書けなくても、残りの待ちを書く。
func (x *Exporter) ExportDue(ctx context.Context) (int, error) {
	jobs, err := x.deps.Exports.Claim(ctx, exportBatch, exportLease)
	if err != nil {
		return 0, err
	}
	var finishErr error
	for _, e := range jobs {
		callCtx, cancel := context.WithTimeout(ctx, exportCallTimeout)
		err := x.export(callCtx, e)
		cancel()
		r := resultOf(e, err)
		// 止める合図で書けなかった待ちは、書こうとした回数に数えずに返す。
		if err != nil && ctx.Err() != nil {
			r = ExportResult{Status: ExportPending, Released: true}
		}
		if err != nil && !r.Released {
			x.log.WarnContext(ctx, "calendar export failed",
				slog.String("export_id", e.ID), slog.String("status", string(r.Status)), slog.Int("attempts", e.Attempts), slog.Any("error", err))
		}
		// 取った待ちは、ctx が終わっても結果を書き、lease の間ほかの処理が書けないままにしない。
		// 1 つの結果を書けなくても、残りの待ちの結果は書く。
		if err := x.deps.Exports.Finish(context.WithoutCancel(ctx), e, r); err != nil {
			finishErr = errors.Join(finishErr, err)
		}
	}
	return len(jobs), finishErr
}

// resultOf は、待ち e を書いたエラー err を、待ちの次の状態にする。
func resultOf(e Export, err error) ExportResult {
	code := func(c ExportErrorCode) *ExportErrorCode { return &c }
	switch {
	case err == nil:
		return ExportResult{Status: ExportSucceeded}
	case errors.Is(err, ErrEventChanged):
		return ExportResult{Status: ExportConflict, ErrorCode: code(ErrorPreconditionFailed)}
	case errors.Is(err, ErrEventGone), errors.Is(err, ErrEventNotFound):
		return ExportResult{Status: ExportConflict, ErrorCode: code(ErrorNotFound)}
	case errors.Is(err, ErrUnwritable):
		return ExportResult{Status: ExportFailed, ErrorCode: code(ErrorForbidden)}
	case errors.Is(err, ErrEventRejected):
		return ExportResult{Status: ExportFailed, ErrorCode: code(ErrorRejected)}
	case e.Attempts >= MaxExportAttempts:
		return ExportResult{Status: ExportFailed, ErrorCode: code(ErrorUnavailable)}
	default:
		return ExportResult{Status: ExportPending, ErrorCode: code(ErrorUnavailable), RetryAfter: exportBackoff << (max(e.Attempts, 1) - 1)}
	}
}

func (x *Exporter) export(ctx context.Context, e Export) error {
	if e.ScheduleID != "" {
		return x.exportSchedule(ctx, e)
	}
	return x.exportRecurring(ctx, e)
}

// exportSchedule は、単発の予定を書く。キャンセルした予定は、外部の予定を消す。
func (x *Exporter) exportSchedule(ctx context.Context, e Export) error {
	d, err := x.deps.Schedules.Get(ctx, e.ScheduleID)
	if errors.Is(err, apperr.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	link, err := optionalLink(x.deps.Calendars.LinkBySchedule(ctx, d.ID))
	if err != nil {
		return err
	}
	var body *EventBody
	if d.Cancel == nil {
		b := ScheduleBody(d)
		body = &b
	}
	return x.sync(ctx, e, item{staffID: d.StaffID, id: d.ID, version: d.Version, link: link, body: body, scheduleID: &d.ID})
}

// exportRecurring は、繰り返しの予定を、規則と除外する日の RRULE と EXDATE で書く。
func (x *Exporter) exportRecurring(ctx context.Context, e Export) error {
	rs, err := x.deps.Recurring.Get(ctx, e.RecurringScheduleID)
	if errors.Is(err, apperr.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	link, err := optionalLink(x.deps.Calendars.LinkByRecurringSchedule(ctx, rs.ID))
	if err != nil {
		return err
	}
	exdates := rs.ExclusionDates
	if link != nil {
		if exdates, err = exportedExclusions(ctx, x.deps.Calendars, x.deps.Schedules, *link, rs.ExclusionDates); err != nil {
			return err
		}
	}
	b := RecurringBody(rs, exdates)
	return x.sync(ctx, e, item{staffID: rs.StaffID, id: rs.ID, version: rs.Version, link: link, body: &b, recurringScheduleID: &rs.ID})
}

// exportedExclusions は、繰り返しの予定 parent の除外する日 dates から、外部の例外の回と対応する予定が置き換えた日を除き、
// 外部の予定の EXDATE に書く日を返す。その日を EXDATE にすると、外部の例外の回が消えるためである。
func exportedExclusions(ctx context.Context, links interface {
	ListLinks(ctx context.Context, externalCalendarID string) ([]Link, error)
}, schedules kernel.Finder[schedule.Detail], parent Link, dates []civil.Date) ([]civil.Date, error) {
	all, err := links.ListLinks(ctx, parent.ExternalCalendarID)
	if err != nil {
		return nil, err
	}
	replaced := map[civil.Date]bool{}
	for _, l := range all {
		if l.RecurringEventID == nil || *l.RecurringEventID != parent.ExternalEventID || l.ScheduleID == nil {
			continue
		}
		d, err := schedules.Get(ctx, *l.ScheduleID)
		if err != nil {
			return nil, err
		}
		if d.OriginalDate != nil {
			replaced[*d.OriginalDate] = true
		}
	}
	out := make([]civil.Date, 0, len(dates))
	for _, d := range dates {
		if !replaced[d] {
			out = append(out, d)
		}
	}
	return out, nil
}

// item は、書く予定である。body が nil なら、外部の予定を消す。scheduleID と recurringScheduleID は、予定の対応に書く値である。
type item struct {
	staffID             string
	id                  string
	version             int
	link                *Link
	body                *EventBody
	scheduleID          *string
	recurringScheduleID *string
}

// sync は、予定 it を、職員が結び付けた外していないカレンダーの内容にそろえる。
// 外部のカレンダーには、そのカレンダーの行の事業所のサービスアカウントで書く（ADR-0012）。
//   - 予定の対応のカレンダーを外していれば、そのカレンダーには書かない。職員に別のカレンダーがあれば、対応を消して、そのカレンダーに作る。
//   - 予定の対応があり、職員のカレンダーが同じなら、外部の予定を更新する。
//   - 予定を消すか、職員のカレンダーが替わったなら、対応の外部の予定を消して対応も消す。
//   - 職員にカレンダーがあり、対応が無ければ、予定の ID から決めた ID で外部の予定を作り、対応を書く。
//
// 外部が 404 を返したときは、予定が消されたのか、カレンダーの共有が外れたのかを見分けられないので、対応を消さない。
// 対応を消すのは、予定が消されたこと（410 か、消された予定への 412）か、消せたことが分かったときだけである。
func (x *Exporter) sync(ctx context.Context, e Export, it item) error {
	cal, err := x.deps.Calendars.ActiveByStaff(ctx, it.staffID)
	hasCal := err == nil
	if err != nil && !errors.Is(err, apperr.ErrNotFound) {
		return err
	}
	if it.link != nil {
		lc, err := x.deps.Calendars.Get(ctx, it.link.ExternalCalendarID)
		if err != nil {
			return err
		}
		switch {
		case lc.DisabledAt != nil && (it.body == nil || !hasCal):
			return nil
		case lc.DisabledAt != nil:
			// 外したカレンダーの予定は消さずに残し、職員の今のカレンダーに作る
		case it.body != nil && hasCal && cal.ID == lc.ID:
			w, err := x.deps.Writers(ctx, lc.FacilityID)
			if err != nil {
				return err
			}
			etag, err := w.Update(ctx, lc.CalendarID, it.link.ExternalEventID, ifMatch(e, *it.link), *it.body)
			if err == nil {
				return x.deps.Calendars.UpdateLink(ctx, it.link.ID, etag, it.version)
			}
			// 書き直すと選んだ予定が外部で消されていたら、対応を消して作り直す。
			if !e.Overwrite || !errors.Is(err, ErrEventGone) {
				return err
			}
		default:
			w, err := x.deps.Writers(ctx, lc.FacilityID)
			if err != nil {
				return err
			}
			if err := w.Delete(ctx, lc.CalendarID, it.link.ExternalEventID, ifMatch(e, *it.link)); err != nil && !errors.Is(err, ErrEventGone) {
				return err
			}
		}
		if err := x.deps.Calendars.DeleteLink(ctx, it.link.ID); err != nil {
			return err
		}
	}
	if it.body == nil || !hasCal {
		return nil
	}
	eventID, err := EventIDOf(it.id)
	if err != nil {
		return err
	}
	w, err := x.deps.Writers(ctx, cal.FacilityID)
	if err != nil {
		return err
	}
	etag, err := w.Insert(ctx, cal.CalendarID, eventID, *it.body)
	if errors.Is(err, ErrEventExists) {
		// 前に作った後で対応を書けなかったか、消した予定である。ID が buddy の予定から決まるので、buddy の内容で書き直す。
		etag, err = w.Update(ctx, cal.CalendarID, eventID, "", *it.body)
	}
	if err != nil {
		return err
	}
	version := it.version
	return x.deps.Calendars.CreateLink(ctx, Link{
		ID: x.ids.NewID(), FacilityID: cal.FacilityID, ExternalCalendarID: cal.ID, ExternalEventID: eventID,
		ETag: etag, SyncedVersion: &version, ScheduleID: it.scheduleID, RecurringScheduleID: it.recurringScheduleID,
	})
}

// ifMatch は、待ち e で外部の予定に付ける If-Match の etag を返す。buddy の内容で書き直す待ちでは付けない。
func ifMatch(e Export, l Link) string {
	if e.Overwrite {
		return ""
	}
	return l.ETag
}

func optionalLink(l Link, err error) (*Link, error) {
	if errors.Is(err, apperr.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}
