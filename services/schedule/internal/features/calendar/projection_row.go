package calendar

import (
	"errors"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// errNoTime は、Google の予定の日時が無いことを表す。
var errNoTime = errors.New("予定の日時が無い")

// CancelledProjectionOf は、カレンダー c の、Google で取り消した単発の予定か繰り返しの親の予定 ev の Projection の行を作る。
// Google は取り消した予定の日時を返さないことがあるので、終わる日は取り消しを写した日 today にする。
// 同期（calendarsync）と、予定の API の書き込み（calendarwrite）が使う。
func CancelledProjectionOf(c ExternalCalendar, ev Event, today civil.Date) scheduleview.Projection {
	return scheduleview.Projection{
		ExternalCalendarID: c.ID, EventID: ev.ID, FacilityID: c.FacilityID, StaffID: c.StaffID,
		Status: scheduleview.ProjectionCancelled, ETag: ev.ETag, GoogleUpdatedAt: updatedOf(ev), LastEndDate: &today,
	}
}

// StampCancellation は、Google が更新の時刻を返さなかった取り消しの予定 ev に、読み始めた時刻 readAt を更新の時刻として入れて返す。
// ほかの予定は ev のまま返す。同期と予定の API の書き込みが、Google から読んだ予定を Projection に写す前に使う。
// Google は、取り消した予定に ID のほかを返さないことがある。時刻の無い取り消しは、時刻のある Projection の行を書き直せず、
// 予定が一覧に残るためである。取り消しは読み始める前に起きているので、readAt より後の Google の変更は、取り消しの後の変更である。
// 読み終えてから当てるまでの時刻を使うと、その間に Google で戻した予定を、次の同期で古い変更とみなすので使わない。
func StampCancellation(ev Event, readAt time.Time) Event {
	if ev.Status == StatusCancelled && ev.Updated == "" {
		ev.Updated = readAt.UTC().Format(time.RFC3339Nano)
	}
	return ev
}

// updatedOf は、Google の予定 ev の更新の時刻を返す。無いか読めないときは nil を返す。
func updatedOf(ev Event) *time.Time {
	t, err := time.Parse(time.RFC3339, ev.Updated)
	if err != nil {
		return nil
	}
	return &t
}

// ProjectionOf は、カレンダー c の Google の予定 ev の Projection の行を作る。取り消した単発の予定と親の予定には呼ばず、CancelledProjectionOf を使う。
// 同期（calendarsync）と、予定の API の書き込み（calendarwrite）が使う。
// 開始、終了、例外の回の元の開始を読めないときは、エラーを返す。エラーの文に、予定のタイトルを含めない。
func ProjectionOf(c ExternalCalendar, ev Event) (scheduleview.Projection, error) {
	p := scheduleview.Projection{
		ExternalCalendarID: c.ID, EventID: ev.ID, FacilityID: c.FacilityID, StaffID: c.StaffID, RecurringEventID: ev.RecurringEventID,
		Status: scheduleview.ProjectionConfirmed, Title: ev.Summary, TimeZone: ev.Start.TimeZone, Recurrence: ev.Recurrence, ETag: ev.ETag,
		GoogleUpdatedAt: updatedOf(ev),
	}
	if ev.RecurringEventID != "" {
		orig, err := timeOf(ev.OriginalStart)
		if err != nil {
			return scheduleview.Projection{}, errors.Join(errors.New("例外の回の元の開始を読めない"), err)
		}
		p.OriginalStart = orig
	}
	if ev.Status == StatusCancelled {
		d, ok := OriginalDate(ev)
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
	// 動かした例外の回は、元の回を置き換える記録なので、元の回が期間の中にある間は残す
	if ev.RecurringEventID != "" && p.LastEndDate != nil {
		if orig := dayOf(p.OriginalStart); p.LastEndDate.Before(orig) {
			p.LastEndDate = &orig
		}
	}
	return p, nil
}

// timeOf は、Google の予定の日時 w を、時刻のある日時か終日の日付にする。どちらも無いか読めないときはエラーを返す。
func timeOf(w When) (scheduleview.ProjectionTime, error) {
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
		return civil.DateOf(t.At.In(Tokyo))
	}
	return *t.Date
}

// lastEndDate は、開始が startDay、終了が endDay の予定 ev が終わる日を返す。終日の予定の終了は、Google と同じく終わる日の翌日である。
// 繰り返しの親の予定は、最後の回が終わる日を返す。最後の回は、取り込みと同じ読み替えの規則（RuleFromRecurrence）で決め、
// 規則に写せないときは RRULE の UNTIL で決める。終わりの無い繰り返しと、UNTIL の無い写せない繰り返し（COUNT など）と、
// RDATE で回を足した写せない繰り返しは nil を返し、保持する期間で消さない。
func lastEndDate(ev Event, startDay, endDay civil.Date) *civil.Date {
	if len(ev.Recurrence) == 0 {
		return &endDay
	}
	span := int(endDay.Time().Sub(startDay.Time()).Hours() / 24)
	if rec, err := RuleFromRecurrence(ev); err == nil {
		if rec.Rule.EndDate == nil {
			return nil
		}
		last := civil.DateOf(rec.Rule.EndDate.Time().AddDate(0, 0, span))
		return &last
	}
	// RDATE の回は UNTIL の後にも足せるので、UNTIL では終わる日を決めない
	if hasRDate(ev.Recurrence) {
		return nil
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

// hasRDate は、繰り返しの規則の行 recurrence に、回を足す RDATE の行があるかを返す。
func hasRDate(recurrence []string) bool {
	for _, line := range recurrence {
		head, _, _ := strings.Cut(line, ":")
		if strings.EqualFold(strings.SplitN(head, ";", 2)[0], "RDATE") {
			return true
		}
	}
	return false
}
