package scheduleview

import (
	"cmp"
	"slices"
	"strings"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

// AllDayEvent は、google_primary の事業所の、Google カレンダーの終日の予定である。buddy の予定ではないので、作ることも変えることもできず、
// 照合の対象にもしない（#672）。
type AllDayEvent struct {
	// ID は、一覧を読むたびに同じになる値である。繰り返しの回は、回ごとに違う値である。
	ID        string
	StaffID   string
	StaffName string
	// StartDate と EndDate は、予定がかかる最初の日と最後の日である。1 日の予定では同じ日である。
	StartDate civil.Date
	EndDate   civil.Date
	// Title は、Google のタイトルを buddy の予定のタイトルの長さに切ったものである。空のことがある。
	Title string
}

// UnlistedCount は、職員の、一覧に出せない予定（EventUnlisted）の件数である。予定の中身は出さない（#672）。
type UnlistedCount struct {
	StaffID string
	Count   int
}

// calendarOnly は、Projection の行 rows のうち、buddy の予定に読み替えない予定を、from から to までの期間に重なる分だけ集めた結果である。
type calendarOnly struct {
	allDay   []AllDayEvent
	unlisted []UnlistedCount
}

// collectCalendarOnly は、rows の終日の予定と、出せない予定の職員ごとの件数を、from から to までの期間に重なる分だけ集める。
// 繰り返しの親は、時刻のある予定と同じ規則で回に展開し、除外する日と、例外の回が置き換えた元の日を除く。規則に写せない繰り返しと、
// 日時を読めない繰り返しは、最初の回の 1 件にする。日時のどちらも読めない予定は、どの期間でも数える。
// 終日の予定は、開始の日、職員の ID、ID の順に並べる。件数は、1 件以上の職員だけを職員の ID の順に返す。
func collectCalendarOnly(rows []ProjectionDetail, rules EventRules, from, to civil.Date) calendarOnly {
	ex := exceptionsOf(rows)
	counts := map[string]int{}
	out := calendarOnly{allDay: []AllDayEvent{}}
	for _, r := range rows {
		if !ex.listable(r) {
			continue
		}
		rd := rules.Read(r.Projection)
		if rd.Kind != EventAllDay && rd.Kind != EventUnlisted {
			continue
		}
		for _, o := range spanOccurrences(r, rd, rules, ex.replacedOf(r), from, to) {
			if rd.Kind == EventUnlisted {
				counts[r.StaffID]++
				continue
			}
			id := r.ScheduleID
			if !o.occurrence.IsZero() {
				id = OccurrenceScheduleID(r.ExternalCalendarID, r.EventID, o.occurrence)
			}
			out.allDay = append(out.allDay, AllDayEvent{
				ID: id, StaffID: r.StaffID, StaffName: r.StaffName, StartDate: o.Date, EndDate: o.LastDate, Title: o.Title,
			})
		}
	}
	slices.SortFunc(out.allDay, func(a, b AllDayEvent) int {
		return cmp.Or(a.StartDate.Time().Compare(b.StartDate.Time()), strings.Compare(a.StaffID, b.StaffID), strings.Compare(a.ID, b.ID))
	})
	out.unlisted = []UnlistedCount{}
	for staffID, n := range counts {
		out.unlisted = append(out.unlisted, UnlistedCount{StaffID: staffID, Count: n})
	}
	slices.SortFunc(out.unlisted, func(a, b UnlistedCount) int { return strings.Compare(a.StaffID, b.StaffID) })
	return out
}

// spanOccurrence は、終日の予定か出せない予定の 1 回である。occurrence は、繰り返しの親を展開した回の元の日で、展開した回でなければゼロ値である。
type spanOccurrence struct {
	EventReading
	occurrence civil.Date
}

// spanOccurrences は、読み替えた予定 rd（行 r）の回のうち、from から to までの期間に重なる回を返す。
func spanOccurrences(r ProjectionDetail, rd EventReading, rules EventRules, replaced map[civil.Date]bool, from, to civil.Date) []spanOccurrence {
	if !r.IsParent() || r.TimeUnreadable {
		if overlaps(rd, from, to) {
			return []spanOccurrence{{EventReading: rd}}
		}
		return nil
	}
	rule, exclusions, err := rules.Recurrence(r.Projection)
	if err != nil {
		// 時刻のある予定の写せない繰り返し（expandParent）と同じく、回が期間に重なりうる間は最初の回の 1 件を返す
		if rd.Date.After(to) || (r.LastEndDate != nil && r.LastEndDate.Before(from)) {
			return nil
		}
		return []spanOccurrence{{EventReading: rd}}
	}
	span := rd.LastDate.Time().Sub(rd.Date.Time())
	var out []spanOccurrence
	for _, d := range occurrenceDays(rd.Date, rule, exclusions, replaced, civil.DateOf(from.Time().Add(-span)), to) {
		occ := rd
		occ.Date, occ.LastDate = d, civil.DateOf(d.Time().Add(span))
		out = append(out, spanOccurrence{EventReading: occ, occurrence: d})
	}
	return out
}

// overlaps は、終日の予定か出せない予定 rd が、from から to までの期間に重なるかを返す。日時のどちらも読めない予定は、どの期間にも重なるとみなす。
func overlaps(rd EventReading, from, to civil.Date) bool {
	if rd.Date.IsZero() {
		return true
	}
	return !rd.Date.After(to) && !rd.LastDate.Before(from)
}

// occurrenceDays は、first の日に始まる繰り返しの規則 rule の回のうち、from から to までの日に始まる回の日を返す。
// 除外する日 exclusions と、例外の回が置き換えた元の日 replaced は除く。
func occurrenceDays(first civil.Date, rule schedule.Rule, exclusions []civil.Date, replaced map[civil.Date]bool, from, to civil.Date) []civil.Date {
	rs := schedule.RecurringSchedule{Slot: schedule.Slot{Date: first}, Rule: rule}
	var out []civil.Date
	for d := from; !d.After(to); d = civil.DateOf(d.Time().AddDate(0, 0, 1)) {
		if rs.HasOccurrenceOn(d) && !replaced[d] && !slices.Contains(exclusions, d) {
			out = append(out, d)
		}
	}
	return out
}

// projectionExceptions は、Projection の行の、例外の回が置き換えた元の日と、取り消した単発の予定と親の予定である。
type projectionExceptions struct {
	// replaced は、親の予定（カレンダーの ID と Google の予定の ID）ごとの、例外の回が置き換えた元の日である。
	replaced map[string]map[civil.Date]bool
	// cancelled は、取り消した単発の予定と親の予定（カレンダーの ID と Google の予定の ID）である。
	cancelled map[string]bool
}

func exceptionsOf(rows []ProjectionDetail) projectionExceptions {
	ex := projectionExceptions{replaced: map[string]map[civil.Date]bool{}, cancelled: map[string]bool{}}
	for _, r := range rows {
		if r.Status == ProjectionCancelled && !r.IsException() {
			ex.cancelled[eventKey(r.ExternalCalendarID, r.EventID)] = true
		}
		if !r.IsException() {
			continue
		}
		d, ok := r.OriginalStart.day()
		if !ok {
			continue
		}
		key := eventKey(r.ExternalCalendarID, r.RecurringEventID)
		if ex.replaced[key] == nil {
			ex.replaced[key] = map[civil.Date]bool{}
		}
		ex.replaced[key][d] = true
	}
	return ex
}

// listable は、行 r が確定の予定で、取り消した親の例外の回でないかを返す。
func (ex projectionExceptions) listable(r ProjectionDetail) bool {
	return r.Status == ProjectionConfirmed && (!r.IsException() || !ex.cancelled[eventKey(r.ExternalCalendarID, r.RecurringEventID)])
}

// replacedOf は、親の予定の行 r の、例外の回が置き換えた元の日を返す。
func (ex projectionExceptions) replacedOf(r ProjectionDetail) map[civil.Date]bool {
	return ex.replaced[eventKey(r.ExternalCalendarID, r.EventID)]
}

func eventKey(externalCalendarID, eventID string) string {
	return externalCalendarID + "\x00" + eventID
}
