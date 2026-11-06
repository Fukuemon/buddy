package calendarsync

import (
	"context"
	"log/slog"
	"strconv"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// retainedMonths は、Projection に行を残す期間の始まりを、今月から何か月前の初日にするかである。照合で前月の予定を読むためである（ADR-0026）。
const retainedMonths = 2

// projectionApplier は、Google カレンダーを予定の正本にする事業所（google_primary）で、Google カレンダーの予定の変更を
// 予定の写し（Projection）に写す（ADR-0026）。予定の対応（EventLink）の有無によらず、Google で新しく作った予定も写す。
//   - 新しい予定と変わった予定は、カレンダーと Google の予定の ID の組の行に書く。同じ予定を何度読んでも、行は 1 つになる。
//     行を書き直すのは、Google の更新の時刻が行より新しいときだけである（Projections.Put）。
//   - 取り消した単発の予定と繰り返しの親の予定は、行を消さず、取り消しの状態にした行に写す。行を消すと、予定の API の書き込みが
//     古い応答で予定を戻すためである。終わる日は取り消しを写した日にし、保持する期間で消す。
//     親の予定の例外の回の行は、取り消した回の行にする。親の行が読む期間の外になっても、例外の回を一覧に出さないためである。
//   - 繰り返しの予定は展開せず、親の予定と例外の回を別の行に写す。取り消した回は、状態を取り消しにした行に写す。
//   - 保持する期間（前々月の初日から）より前に終わった予定は、写さずに行を消す。期間の終わり（3 か月後の月末）より後の予定も写す。
//     増分の取得は、変わっていない予定を返さないので、期間に入ったときに写せないためである。
//   - 日時を読めない予定は、写さずに行を消し、事業所、カレンダー、Google の予定の ID だけをログに書く。ほかの予定は写し続ける。
//
// 写す前に、予定の API が書いた予定の保留の版を確定する（ADR-0026）。予定の extendedProperties.private の buddy の予定の ID の記録が、
// このカレンダーのこの予定で、版が保留の版と同じなら、calendar.ConfirmPending で確定する。版が違っても、取り消した予定でも、
// 保留の版を消さない。読んだ予定が、予定の API が Google に書く前のものであることがあるためで、消すのは読み戻し（Syncer.ReadBackDue）である。
type projectionApplier struct {
	projections Projections
	records     calendar.EventRecords
	visits      calendar.UnusedVisits
	now         func() time.Time
	log         *slog.Logger
}

// NewProjectionApplier は、今の時刻を time.Now で読み、Google カレンダーの予定の変更を projections に写す Applier を作る。
// 保留の版を確定するときに、records の記録を書き、使われなくなった訪問の情報を visits で消す。
// 組み立て（assemble）が、google_primary の事業所の Applier として Syncer に渡す。
func NewProjectionApplier(projections Projections, records calendar.EventRecords, visits calendar.UnusedVisits, log *slog.Logger) Applier {
	return projectionApplier{projections: projections, records: records, visits: visits, now: time.Now, log: log}
}

// Apply は、Applier の Apply を実装する。
func (a projectionApplier) Apply(ctx context.Context, c calendar.ExternalCalendar, ev calendar.Event) error {
	if err := a.confirm(ctx, c, ev); err != nil {
		return err
	}
	if ev.Status == calendar.StatusCancelled && ev.RecurringEventID == "" {
		if err := a.projections.Put(ctx, calendar.CancelledProjectionOf(c, ev, civil.Today(a.now()))); err != nil {
			return err
		}
		return a.projections.CancelOccurrences(ctx, c.ID, ev.ID)
	}
	p, err := calendar.ProjectionOf(c, ev)
	if err != nil {
		a.log.WarnContext(ctx, "calendar projection skipped",
			slog.String("facility_id", c.FacilityID), slog.String("external_calendar_id", c.ID), slog.String("event_id", ev.ID),
			slog.Any("error", err))
		return a.projections.Delete(ctx, c.ID, ev.ID)
	}
	if p.LastEndDate != nil && p.LastEndDate.Before(retainedFrom(a.now())) {
		return a.projections.Delete(ctx, c.ID, ev.ID)
	}
	return a.projections.Put(ctx, p)
}

// confirm は、カレンダー c の予定 ev が、予定の API が書いた記録の保留の版と同じ版なら、保留の版を確定する。
func (a projectionApplier) confirm(ctx context.Context, c calendar.ExternalCalendar, ev calendar.Event) error {
	id := ev.Private[calendar.PropScheduleID]
	version, err := strconv.Atoi(ev.Private[calendar.PropVersion])
	if id == "" || err != nil || ev.Status == calendar.StatusCancelled {
		return nil
	}
	rec, ok, err := calendar.LockPending(ctx, a.records, id, version)
	if err != nil || !ok || rec.ExternalCalendarID != c.ID || rec.ExternalEventID != ev.ID {
		return err
	}
	return calendar.ConfirmPending(ctx, a.records, a.visits, rec)
}

// Settle は、Applier の Settle を実装する。全ての予定を読み直したときは、読み直しに無かったカレンダーの行を消す。
// 増分で取り消しを取りこぼしても、トークンが切れて（410）読み直したときに直る。
// 終わりに、保持する期間より前に終わった行を消す。読んだ予定が無い回も、期間が進むので消す。
func (a projectionApplier) Settle(ctx context.Context, c calendar.ExternalCalendar, full bool, eventIDs []string) error {
	if full {
		if err := a.projections.DeleteExcept(ctx, c.ID, eventIDs); err != nil {
			return err
		}
	}
	return a.projections.DeleteEndedBefore(ctx, c.ID, retainedFrom(a.now()))
}

// retainedFrom は、今の時刻 now の、Projection に行を残す期間の始まりの日（Asia/Tokyo で前々月の初日）を返す。
func retainedFrom(now time.Time) civil.Date {
	today := civil.Today(now)
	return civil.DateOf(time.Date(today.Year, today.Month-retainedMonths, 1, 0, 0, 0, 0, time.UTC))
}
