package calendarimport

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// findOpen は、事業所 facilityID の open の切り替えを返す。無ければ nil を返す。
func findOpen(ctx context.Context, cutovers CutoverRepository, facilityID string) (*Cutover, error) {
	c, err := cutovers.FindOpen(ctx, facilityID)
	if errors.Is(err, apperr.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// requireImportable は、事業所 f に予定を取り込めるかを確認する。buddy を予定の正本にする事業所と、open の切り替え open がある
// Google カレンダーを予定の正本にする事業所で取り込める（ADR-0027 の RequireWritable の例外、ADR-0029）。
// 取り込めないときは、schedule.RequireWritable と同じく code が schedule.CodeGooglePrimary の apperr.ErrConflict を返す。
func requireImportable(f organization.Facility, open *Cutover) error {
	if open != nil && open.FacilityID == f.ID && f.SourceMode == organization.SourceGooglePrimary {
		return nil
	}
	return schedule.RequireWritable(f)
}

// requireCutoverRange は、取り込みの期間 rng を確認する。open の切り替えがあれば、期間は切り替えの期間（切り替えの月の初日から
// 先の全て）でなければならない。無ければ、期間は終わりを持たなければならない。合わなければ入力のエラーを返す。
func requireCutoverRange(rng Range, open *Cutover) error {
	if open != nil {
		if rng != open.Range() {
			return apperr.Invalid("切り替えの間の取り込みの期間は、%s から終わりを持たない期間にします", open.RangeStart)
		}
		return nil
	}
	if !rng.HasEnd() {
		return apperr.Invalid("期間の終了日を指定します")
	}
	return nil
}

// errCutoverClosed は、取り込みを読み替えた後に、切り替えを完了したかやめたことを表す。
var errCutoverClosed = apperr.ConflictCode(CodeCutoverNotOpen, "取り込みの途中で、切り替えが完了したか、やめました。もう一度プレビューしてください")

// staleLink は、Google の予定と食い違う予定の対応である。event は Google の今の予定で、Google で消えていれば nil である。
type staleLink struct {
	link  calendar.EventLink
	event *calendar.Event
}

// mismatchedLinks は、links のうち、Google の予定 events に無いか、etag が違う予定の対応を返す。
func mismatchedLinks(events []calendar.Event, links []calendar.EventLink) []staleLink {
	byID := make(map[string]calendar.Event, len(events))
	for _, ev := range events {
		byID[ev.ID] = ev
	}
	var out []staleLink
	for _, l := range links {
		ev, ok := byID[l.ExternalEventID]
		switch {
		case !ok:
			out = append(out, staleLink{link: l})
		case ev.ETag != l.ETag:
			out = append(out, staleLink{link: l, event: &ev})
		}
	}
	return out
}

// seriesOf は、予定の対応の繰り返しのまとまりで、繰り返しの回の対応では親の予定の ID、ほかの対応では外部の予定の ID である。
func seriesOf(l calendar.EventLink) string {
	if l.RecurringEventID != nil {
		return *l.RecurringEventID
	}
	return l.ExternalEventID
}

// splitStale は、links を、Google と食い違うまとまりの対応と、ほかの対応に分ける。
// 繰り返しの親か回の 1 つでも食い違えば、親と回の全ての対応を食い違うものにする。回の置き換えは親の繰り返しの予定を指すので、
// 親だけを取り込み直せないためである。
func splitStale(events []calendar.Event, links []calendar.EventLink) (stale, rest []calendar.EventLink) {
	series := map[string]bool{}
	for _, m := range mismatchedLinks(events, links) {
		series[seriesOf(m.link)] = true
	}
	for _, l := range links {
		if series[seriesOf(l)] {
			stale = append(stale, l)
		} else {
			rest = append(rest, l)
		}
	}
	return stale, rest
}

// unmetEvents は、完了の確認で、plan の予定のうち、取り込んでいないか、取り込み方を決めていない予定を返す。
// skips は、取り込まないと決めた予定の ReviewItem.ExternalEventID ごとの、決めたときのバージョンである。
// バージョンが今の ReviewItem.Revision と違えば、決めた後に予定が変わったので、決めていない予定にする。
func (p plan) unmetEvents(skips map[string]string) []Unmet {
	decided := map[string]bool{}
	var out []Unmet
	for _, r := range p.reviewItems {
		if rev, ok := skips[r.ExternalEventID]; ok && rev == r.Revision {
			decided[r.ExternalEventID] = true
			continue
		}
		date, start, end := r.Date, r.StartTime, r.EndTime
		out = append(out, Unmet{
			Reason: UnmetNeedsReview, ExternalEventID: r.ExternalEventID, ReviewReason: r.Reason,
			Date: &date, StartTime: &start, EndTime: &end, EndsNextDay: r.EndsNextDay,
		})
	}
	for _, e := range p.entries {
		if e.reviewKey != "" || (e.replaces != nil && decided[e.replaces.parentEventID]) {
			continue
		}
		out = append(out, unmetOf(UnmetEventNotImported, e.event.ID, e.cand))
	}
	// 親の予定ごと取り込んでいない回の除外は、親の予定が取り込んでいない予定に入るので、前の取り込みの繰り返しの予定の除外だけを返す。
	for _, x := range p.exclusions {
		if x.recurringScheduleID == "" {
			continue
		}
		d := x.date
		out = append(out, Unmet{Reason: UnmetEventNotImported, Date: &d})
	}
	return out
}

// staleUnmets は、Google と食い違う予定の対応を、完了の確認を満たさない予定にする。
func staleUnmets(events []calendar.Event, links []calendar.EventLink) []Unmet {
	var out []Unmet
	for _, m := range mismatchedLinks(events, links) {
		if m.event == nil {
			out = append(out, Unmet{Reason: UnmetDeleted, ExternalEventID: m.link.ExternalEventID})
			continue
		}
		out = append(out, unmetOf(UnmetChanged, m.event.ID, calendar.Classify(*m.event)))
	}
	return out
}

// unmetOf は、読み替えた予定 c を、理由 reason の完了の確認を満たさない予定にする。日時は、読めたときだけ持つ。
func unmetOf(reason UnmetReason, eventID string, c calendar.Candidate) Unmet {
	u := Unmet{Reason: reason, ExternalEventID: eventID, EndsNextDay: c.EndsNextDay}
	if !c.Date.IsZero() {
		d := c.Date
		u.Date = &d
	}
	if c.StartTime.Before(c.EndTime) || c.EndsNextDay {
		st, et := c.StartTime, c.EndTime
		u.StartTime, u.EndTime = &st, &et
	}
	return u
}

// skipsOf は、取り込み方 decisions のうち、取り込まないを選んだものを、切り替えの取り込まない予定の記録にする。
func skipsOf(cutoverID string, c calendar.ExternalCalendar, decisions []Decision) []CutoverSkip {
	var out []CutoverSkip
	for _, d := range decisions {
		if d.Action == ActionSkip {
			out = append(out, CutoverSkip{
				CutoverID: cutoverID, FacilityID: c.FacilityID, ExternalCalendarID: c.ID, ExternalEventID: d.ExternalEventID, Revision: d.Revision,
			})
		}
	}
	return out
}
