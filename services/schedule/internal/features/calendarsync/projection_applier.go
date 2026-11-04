package calendarsync

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// retainedMonths は、Projection に行を残す期間の始まりを、今月から何か月前の初日にするかである。照合で前月の予定を読むためである（ADR-0035）。
const retainedMonths = 2

// errNoTime は、Google の予定の日時が無いことを表す。
var errNoTime = errors.New("予定の日時が無い")

// projectionApplier は、Google カレンダーを予定の正本にする事業所（google_primary）で、Google カレンダーの予定の変更を
// 予定の写し（Projection）に写す（ADR-0035）。予定の対応（EventLink）の有無によらず、Google で新しく作った予定も写す。
//   - 新しい予定と変わった予定は、カレンダーと Google の予定の ID の組の行に書く。同じ予定を何度読んでも、行は 1 つになる。
//   - 取り消した単発の予定と繰り返しの親の予定は、行を消す。親の予定の行を消すときは、その例外の回の行も消す。
//   - 繰り返しの予定は展開せず、親の予定と例外の回を別の行に写す。取り消した回は、状態を取り消しにした行に写す。
//   - 保持する期間（前々月の初日から）より前に終わった予定は、写さずに行を消す。期間の終わり（3 か月後の月末）より後の予定も写す。
//     増分の取得は、変わっていない予定を返さないので、期間に入ったときに写せないためである。
//   - 日時を読めない予定は、写さずに行を消し、事業所、カレンダー、Google の予定の ID だけをログに書く。ほかの予定は写し続ける。
type projectionApplier struct {
	projections Projections
	now         func() time.Time
	log         *slog.Logger
}

// NewProjectionApplier は、今の時刻を time.Now で読み、Google カレンダーの予定の変更を projections に写す Applier を作る。
// 組み立て（assemble）が、google_primary の事業所の Applier として Syncer に渡す。
func NewProjectionApplier(projections Projections, log *slog.Logger) Applier {
	return projectionApplier{projections: projections, now: time.Now, log: log}
}

// Apply は、Applier の Apply を実装する。
func (a projectionApplier) Apply(ctx context.Context, c calendar.ExternalCalendar, ev calendar.Event) error {
	if ev.Status == calendar.StatusCancelled && ev.RecurringEventID == "" {
		return a.projections.Delete(ctx, c.ID, ev.ID)
	}
	p, err := projectionOf(c, ev)
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

// projectionOf は、カレンダー c の Google の予定 ev の行を作る。取り消した単発の予定と親の予定には呼ばない。
// 開始、終了、例外の回の元の開始を読めないときは、エラーを返す。エラーの文に、予定のタイトルを含めない。
func projectionOf(c calendar.ExternalCalendar, ev calendar.Event) (scheduleview.Projection, error) {
	p := scheduleview.Projection{
		ExternalCalendarID: c.ID, EventID: ev.ID, FacilityID: c.FacilityID, StaffID: c.StaffID, RecurringEventID: ev.RecurringEventID,
		Status: scheduleview.ProjectionConfirmed, Title: ev.Summary, TimeZone: ev.Start.TimeZone, Recurrence: ev.Recurrence, ETag: ev.ETag,
	}
	if t, err := time.Parse(time.RFC3339, ev.Updated); err == nil {
		p.GoogleUpdatedAt = &t
	}
	if ev.RecurringEventID != "" {
		orig, err := timeOf(ev.OriginalStart)
		if err != nil {
			return scheduleview.Projection{}, errors.Join(errors.New("例外の回の元の開始を読めない"), err)
		}
		p.OriginalStart = orig
	}
	if ev.Status == calendar.StatusCancelled {
		d, ok := calendar.OriginalDate(ev)
		if !ok {
			return scheduleview.Projection{}, errors.New("取り消した回の元の日付を読めない")
		}
		p.Status, p.Title, p.TimeZone, p.LastEndDate = scheduleview.ProjectionCancelled, "", "", &d
		return p, nil
	}
	start, err := timeOf(ev.Start)
	if err != nil {
		return scheduleview.Projection{}, errors.Join(errors.New("開始を読めない"), err)
	}
	end, err := timeOf(ev.End)
	if err != nil {
		return scheduleview.Projection{}, errors.Join(errors.New("終了を読めない"), err)
	}
	p.Start, p.End = start, end
	p.LastEndDate = lastEndDate(ev, dayOf(start), dayOf(end))
	return p, nil
}

// timeOf は、Google の予定の日時 w を、時刻のある日時か終日の日付にする。どちらも無いか読めないときはエラーを返す。
func timeOf(w calendar.When) (scheduleview.ProjectionTime, error) {
	if w.DateTime != "" {
		t, err := w.Instant()
		if err != nil {
			return scheduleview.ProjectionTime{}, err
		}
		return scheduleview.ProjectionTime{At: &t}, nil
	}
	if w.Date != "" {
		d, err := civil.ParseDate(w.Date)
		if err != nil {
			return scheduleview.ProjectionTime{}, err
		}
		return scheduleview.ProjectionTime{Date: &d}, nil
	}
	return scheduleview.ProjectionTime{}, errNoTime
}

// dayOf は、日時 t の Asia/Tokyo の日付を返す。終日の予定は、その日付を返す。
func dayOf(t scheduleview.ProjectionTime) civil.Date {
	if t.At != nil {
		return civil.DateOf(t.At.In(calendar.Tokyo))
	}
	return *t.Date
}

// lastEndDate は、開始が startDay、終了が endDay の予定 ev が終わる日を返す。終日の予定の終了は、Google と同じく終わる日の翌日である。
// 繰り返しの親の予定は、最後の回が終わる日を返す。最後の回は、取り込みと同じ読み替えの規則（calendar.RuleFromRecurrence）で決め、
// 規則に写せないときは RRULE の UNTIL で決める。終わりの無い繰り返しと、UNTIL の無い写せない繰り返し（COUNT など）は nil を返し、
// 保持する期間で消さない。
func lastEndDate(ev calendar.Event, startDay, endDay civil.Date) *civil.Date {
	if len(ev.Recurrence) == 0 {
		return &endDay
	}
	span := int(endDay.Time().Sub(startDay.Time()).Hours() / 24)
	if rec, err := calendar.RuleFromRecurrence(ev); err == nil {
		if rec.Rule.EndDate == nil {
			return nil
		}
		last := civil.DateOf(rec.Rule.EndDate.Time().AddDate(0, 0, span))
		return &last
	}
	until, ok := rruleUntil(ev.Recurrence)
	if !ok {
		return nil
	}
	// UNTIL は UTC のことがあるので、Asia/Tokyo で 1 日後に当たっても消さないよう、1 日を足す
	last := civil.DateOf(until.Time().AddDate(0, 0, span+1))
	return &last
}

// rruleUntil は、繰り返しの規則の行 recurrence の RRULE の UNTIL の日付を返す。RRULE か UNTIL が無いか、読めないときは false を返す。
func rruleUntil(recurrence []string) (civil.Date, bool) {
	for _, line := range recurrence {
		head, value, ok := strings.Cut(line, ":")
		if !ok || !strings.EqualFold(strings.SplitN(head, ";", 2)[0], "RRULE") {
			continue
		}
		for part := range strings.SplitSeq(value, ";") {
			k, v, _ := strings.Cut(part, "=")
			if !strings.EqualFold(k, "UNTIL") || len(v) < len("20060102") {
				continue
			}
			t, err := time.Parse("20060102", v[:len("20060102")])
			if err != nil {
				return civil.Date{}, false
			}
			return civil.DateOf(t), true
		}
	}
	return civil.Date{}, false
}
