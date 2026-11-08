package calendarwrite_test

import (
	"errors"
	"maps"
	"net/http"
	"slices"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// nextID は、規則を変えたときの新しい繰り返しの予定の ID である。
const nextID = "01M3TC5H00QV17BC0J9V3393ZS"

// mondays は、規則を変える毎週月曜の繰り返しの予定の回の日付である。今日（2026-10-21）の前の月曜から 4 回である。
var mondays = []civil.Date{{Year: 2026, Month: 10, Day: 19}, {Year: 2026, Month: 10, Day: 26}, {Year: 2026, Month: 11, Day: 2}, {Year: 2026, Month: 11, Day: 9}}

// tuesdayRule は、毎週火曜の繰り返しの規則である。
var tuesdayRule = schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{2}}

// seedWeekly は、dates[0] に始まる毎週の訪問の繰り返しの予定を作り、Google のフェイクに、親の予定から dates の回を持たせる。
// 回は seedRecurring と同じく、親の予定の ID と回の開始の UTC の時刻を ID にし、親の予定の内容を引き継ぐ。
func (fx *fixture) seedWeekly(t *testing.T, dates []civil.Date) scheduleview.RecurringDetail {
	t.Helper()
	in := visitSlot()
	in.Date = dates[0]
	got, err := fx.createRecurring.Do(editorCtx(), inmem.FacilityID, scheduleID, in, weekly)
	if err != nil {
		t.Fatal(err)
	}
	parent := fx.google.Event(calendarID, eventID(t))
	var items []*calendarv3.Event
	for _, d := range dates {
		start := time.Date(d.Year, d.Month, d.Day, 9, 0, 0, 0, calendar.Tokyo)
		items = append(items, &calendarv3.Event{
			Id: instanceID(t, d), Status: "confirmed", Summary: parent.Summary, RecurringEventId: parent.Id, Etag: `"i` + d.String() + `"`,
			OriginalStartTime:  &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
			Start:              &calendarv3.EventDateTime{DateTime: start.Format(time.RFC3339), TimeZone: calendar.TimeZone},
			End:                &calendarv3.EventDateTime{DateTime: start.Add(time.Hour).Format(time.RFC3339), TimeZone: calendar.TimeZone},
			ExtendedProperties: &calendarv3.EventExtendedProperties{Private: maps.Clone(parent.ExtendedProperties.Private)},
		})
	}
	fx.google.Instances = map[string][]*calendarv3.Event{parent.Id: items}
	return got
}

// moveToAfternoon は、繰り返しの予定 scheduleID の d の回を、13 時からの例外の回にする。
func (fx *fixture) moveToAfternoon(t *testing.T, d civil.Date) {
	t.Helper()
	in := visitSlot()
	in.Date, in.StartTime, in.EndTime = d, civil.Time{Hour: 13}, civil.Time{Hour: 14}
	if _, err := fx.changeOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, d, in); err != nil {
		t.Fatal(err)
	}
}

// parentETag は、Google のフェイクの、繰り返しの予定 scheduleID の親の予定の etag である。
func (fx *fixture) parentETag(t *testing.T) string {
	t.Helper()
	return fx.google.Event(calendarID, eventID(t)).Etag
}

// singles は、カレンダー calendarID の、繰り返しの親でも例外の回でもない予定である。
func (fx *fixture) singles() []calendarv3.Event {
	var out []calendarv3.Event
	for _, ev := range fx.google.Events(calendarID) {
		if len(ev.Recurrence) == 0 && ev.RecurringEventId == "" {
			out = append(out, ev)
		}
	}
	return out
}

// parents は、カレンダー calendarID の繰り返しの親の予定である。
func (fx *fixture) parents() []calendarv3.Event {
	var out []calendarv3.Event
	for _, ev := range fx.google.Events(calendarID) {
		if len(ev.Recurrence) > 0 {
			out = append(out, ev)
		}
	}
	return out
}

// requireDetached は、d の例外の回が Google で取り消され、回の一覧での ID の記録が、同じカレンダーの単発の予定 single を指すことを確認する。
// 単発の予定は、例外の回の 13 時からの時刻のままで、記録は親の予定と別の訪問の情報の行を持つ。
func (fx *fixture) requireDetached(t *testing.T, d civil.Date, single calendarv3.Event, parentVisit string) {
	t.Helper()
	id := scheduleview.OccurrenceScheduleID(externalID, eventID(t), d)
	if ev := fx.google.Event(calendarID, instanceID(t, d)); ev == nil || ev.Status != "cancelled" {
		t.Errorf("%s の例外の回 = %+v, want 取り消した回", d, ev)
	}
	if single.Start.DateTime != d.String()+"T13:00:00" || single.ExtendedProperties.Private[calendar.PropScheduleID] != id {
		t.Errorf("作り直した単発の予定 = %+v, private = %v", single, single.ExtendedProperties.Private)
	}
	r, ok := fx.store.Records[id]
	if !ok || r.Version != 1 || r.Pending != nil || r.ExternalCalendarID != externalID || r.ExternalEventID != single.Id ||
		r.VisitInfoID == nil || *r.VisitInfoID == parentVisit {
		t.Errorf("回の記録 = %+v, ok = %v", r, ok)
	}
}

// TestChangeRuleSplits は、毎週月曜の繰り返しの予定を、適用の日から毎週火曜に変えると、元の親の予定の RRULE が適用の日の前の日の
// UNTIL になり、同じカレンダーに火曜の RRULE の新しい親の予定ができることを確認する。
// 適用の日以降の変えた例外の回は単発の予定に作り直されて元の回が消え、適用の日より前の例外の回と取り消した回は変わらない。
func TestChangeRuleSplits(t *testing.T) {
	fx := newFixture(t)
	rs := fx.seedWeekly(t, mondays)
	fx.moveToAfternoon(t, mondays[0])
	fx.moveToAfternoon(t, mondays[2])
	if _, err := fx.cancelOccurrence.Do(editorCtx(), inmem.FacilityID, scheduleID, mondays[3], "利用者の都合"); err != nil {
		t.Fatal(err)
	}
	parentBefore, _ := fx.record(t)
	effective := mondays[1]

	got, err := fx.changeRule.Do(editorCtx(), inmem.FacilityID, scheduleID, nextID, fx.parentETag(t), &effective, tuesdayRule)
	if err != nil {
		t.Fatal(err)
	}
	tuesday := civil.Date{Year: 2026, Month: 10, Day: 27}
	if got.ID != nextID || got.Date != tuesday || !slices.Equal(got.Rule.DaysOfWeek, []int{2}) || got.Rule.EndDate != nil ||
		got.StartTime != (civil.Time{Hour: 9}) || got.StaffID != inmem.StaffID || got.Visit == nil || got.Visit.ID == rs.Visit.ID ||
		got.Visit.PatientID != inmem.PatientID || got.Version != 1 {
		t.Errorf("got = %+v, visit = %+v", got, got.Visit)
	}
	old := fx.google.Event(calendarID, eventID(t))
	if want := []string{"RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;WKST=SU;UNTIL=20261025T145959Z"}; !slices.Equal(old.Recurrence, want) || old.Status != "confirmed" ||
		old.ExtendedProperties.Private[calendar.PropScheduleID] != scheduleID {
		t.Errorf("元の親の予定 = %+v, want 繰り返し %v", old, want)
	}
	nextEventID, err := calendar.EventIDOf(nextID)
	if err != nil {
		t.Fatal(err)
	}
	next := fx.google.Event(calendarID, nextEventID)
	if next == nil || !slices.Equal(next.Recurrence, []string{"RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;WKST=SU"}) || next.Start.DateTime != "2026-10-27T09:00:00" ||
		next.Summary != old.Summary || next.ExtendedProperties.Private[calendar.PropScheduleID] != nextID {
		t.Fatalf("新しい親の予定 = %+v", next)
	}
	if r, ok := fx.store.Records[nextID]; !ok || r.Version != 1 || r.Pending != nil || r.VisitInfoID == nil || *r.VisitInfoID != got.Visit.ID {
		t.Errorf("新しい親の記録 = %+v, ok = %v", r, ok)
	}
	if r, _ := fx.record(t); r.Version != parentBefore.Version || r.Pending != nil || *r.VisitInfoID != *parentBefore.VisitInfoID {
		t.Errorf("元の親の記録 = %+v, want %+v", r, parentBefore)
	}
	singles := fx.singles()
	if len(singles) != 1 {
		t.Fatalf("単発の予定 = %+v, want 適用の日以降の変えた回の 1 件", singles)
	}
	fx.requireDetached(t, mondays[2], singles[0], rs.Visit.ID)
	if ev := fx.google.Event(calendarID, instanceID(t, mondays[0])); ev.Status != "confirmed" || ev.RecurringEventId != eventID(t) ||
		ev.Start.DateTime != "2026-10-19T13:00:00" {
		t.Errorf("適用の日より前の例外の回 = %+v", ev)
	}
	if ev := fx.google.Event(calendarID, instanceID(t, mondays[3])); ev.Status != "cancelled" {
		t.Errorf("取り消した回 = %+v", ev)
	}
	p, ok := fx.projection(t)
	if !ok || !slices.Equal(p.Recurrence, old.Recurrence) {
		t.Errorf("元の親の Projection = %+v, ok = %v", p, ok)
	}
	if p, ok := fx.store.Projections[inmem.ProjectionKey{ExternalCalendarID: externalID, EventID: nextEventID}]; !ok || !p.IsParent() {
		t.Errorf("新しい親の Projection = %+v, ok = %v", p, ok)
	}
}

// TestChangeRuleInPlace は、適用の日より前の回が無い繰り返しの予定の規則を変えると、id の新しい親の予定ができ、元の親の予定と
// その記録が消えることを確認する。変えた例外の回は、親の予定を消す前に単発の予定に作り直す。
func TestChangeRuleInPlace(t *testing.T) {
	fx := newFixture(t)
	rs := fx.seedWeekly(t, mondays[1:])
	fx.moveToAfternoon(t, mondays[2])
	effective := mondays[1]

	got, err := fx.changeRule.Do(editorCtx(), inmem.FacilityID, scheduleID, nextID, fx.parentETag(t), &effective, tuesdayRule)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != nextID || got.Date != (civil.Date{Year: 2026, Month: 10, Day: 27}) || got.Visit == nil {
		t.Errorf("got = %+v", got)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); ev.Status != "cancelled" {
		t.Errorf("元の親の予定 = %+v, want 消した予定", ev)
	}
	if _, ok := fx.record(t); ok {
		t.Error("元の親の記録が残った")
	}
	if _, ok := fx.store.Infos[rs.Visit.ID]; ok {
		t.Error("元の親の訪問の情報が残った")
	}
	if parents := fx.parents(); len(parents) != 1 || !slices.Equal(parents[0].Recurrence, []string{"RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;WKST=SU"}) {
		t.Errorf("親の予定 = %+v, want 新しい親の 1 件", parents)
	}
	singles := fx.singles()
	if len(singles) != 1 {
		t.Fatalf("単発の予定 = %+v, want 変えた回の 1 件", singles)
	}
	fx.requireDetached(t, mondays[2], singles[0], rs.Visit.ID)
}

// TestChangeRuleEndDate は、終了日だけを変えると、親の予定の RRULE の UNTIL だけが変わり、新しい親の予定を作らないことを確認する。
// 新しい終了日の後の変えた例外の回は単発の予定に作り直され、終了日までの例外の回は変わらない。
func TestChangeRuleEndDate(t *testing.T) {
	fx := newFixture(t)
	rs := fx.seedWeekly(t, mondays)
	fx.moveToAfternoon(t, mondays[1])
	fx.moveToAfternoon(t, mondays[3])
	end := civil.Date{Year: 2026, Month: 11, Day: 8}

	got, err := fx.changeRule.Do(editorCtx(), inmem.FacilityID, scheduleID, "", fx.parentETag(t), nil,
		schedule.RuleInput{Frequency: schedule.Weekly, DaysOfWeek: []int{1}, EndDate: &end})
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != scheduleID || got.Date != mondays[0] || got.Rule.EndDate == nil || *got.Rule.EndDate != end || got.Visit == nil ||
		got.Visit.ID != rs.Visit.ID || len(got.ExclusionDates) != 0 {
		t.Errorf("got = %+v", got)
	}
	parents := fx.parents()
	if want := []string{"RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;WKST=SU;UNTIL=20261108T145959Z"}; len(parents) != 1 || parents[0].Id != eventID(t) ||
		!slices.Equal(parents[0].Recurrence, want) || parents[0].Start.DateTime != "2026-10-19T09:00:00" {
		t.Errorf("親の予定 = %+v, want 繰り返し %v の 1 件", parents, want)
	}
	singles := fx.singles()
	if len(singles) != 1 {
		t.Fatalf("単発の予定 = %+v, want 終了日の後の変えた回の 1 件", singles)
	}
	fx.requireDetached(t, mondays[3], singles[0], rs.Visit.ID)
	if ev := fx.google.Event(calendarID, instanceID(t, mondays[1])); ev.Status != "confirmed" || ev.RecurringEventId != eventID(t) {
		t.Errorf("終了日までの例外の回 = %+v", ev)
	}
}

// TestChangeRuleResend は、元の親の予定の RRULE を書けなかった後に同じ id で送り直すと、作り直した単発の予定と新しい親の予定を
// 重ねて作らずに、元の親の予定の RRULE を書くことを確認する。
func TestChangeRuleResend(t *testing.T) {
	fx := newFixture(t)
	rs := fx.seedWeekly(t, mondays)
	fx.moveToAfternoon(t, mondays[2])
	effective := mondays[1]
	// 例外の回の作り直し（作成と削除）と新しい親の予定の作成を通し、元の親の予定の部分更新を 429 で拒ませる。
	fx.google.Failures = []int{0, 0, 0, http.StatusTooManyRequests}

	_, err := fx.changeRule.Do(editorCtx(), inmem.FacilityID, scheduleID, nextID, fx.parentETag(t), &effective, tuesdayRule)
	if !errors.Is(err, calendarwrite.ErrGoogleUnavailable) {
		t.Fatalf("err = %v, want ErrGoogleUnavailable", err)
	}
	if ev := fx.google.Event(calendarID, eventID(t)); !slices.Equal(ev.Recurrence, []string{"RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;WKST=SU"}) {
		t.Errorf("書けなかった元の親の予定の繰り返し = %v", ev.Recurrence)
	}

	got, err := fx.changeRule.Do(editorCtx(), inmem.FacilityID, scheduleID, nextID, fx.parentETag(t), &effective, tuesdayRule)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != nextID {
		t.Errorf("got = %+v", got)
	}
	if parents := fx.parents(); len(parents) != 2 {
		t.Errorf("親の予定 = %d 件, want 元と新しい親の 2 件", len(parents))
	}
	if ev := fx.google.Event(calendarID, eventID(t)); !slices.Equal(ev.Recurrence, []string{"RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;WKST=SU;UNTIL=20261025T145959Z"}) {
		t.Errorf("元の親の予定の繰り返し = %v", ev.Recurrence)
	}
	singles := fx.singles()
	if len(singles) != 1 {
		t.Fatalf("単発の予定 = %d 件, want 1 件", len(singles))
	}
	fx.requireDetached(t, mondays[2], singles[0], rs.Visit.ID)
}

// TestChangeRuleRejects は、etag と id の無いリクエスト、過去の適用の日、Google で変わった親の予定、buddy の規則に写せない親の予定、
// 保留の版がある親を、Google に書かずに拒むことを確認する。
// 置き換えた回の元の日に新しい規則が当たるときは、新しい親の予定の EXDATE にして、その日の回を出さない（ADR-0037）。
func TestChangeRuleExcludesReplacedDate(t *testing.T) {
	fx := newFixture(t)
	fx.seedWeekly(t, mondays)
	fx.moveToAfternoon(t, mondays[1])
	effective := mondays[1]
	// 10-26 は第 4 月曜である
	rule := schedule.RuleInput{Frequency: schedule.Monthly, WeekOfMonth: ptr(4), DayOfWeek: ptr(1)}
	got, err := fx.changeRule.Do(editorCtx(), inmem.FacilityID, scheduleID, nextID, fx.parentETag(t), &effective, rule)
	if err != nil {
		t.Fatal(err)
	}
	if got.Date != mondays[1] || !slices.Equal(got.ExclusionDates, []civil.Date{mondays[1]}) {
		t.Errorf("got = 最初の日付 %v、除外する日 %v, want %v と [%v]", got.Date, got.ExclusionDates, mondays[1], mondays[1])
	}
	nextEventID, err := calendar.EventIDOf(nextID)
	if err != nil {
		t.Fatal(err)
	}
	next := fx.google.Event(calendarID, nextEventID)
	if next == nil || !slices.Contains(next.Recurrence, "EXDATE;TZID=Asia/Tokyo:20261026T090000") {
		t.Errorf("新しい親の予定 = %+v, want 10-26 の EXDATE", next)
	}
}

// 新しい繰り返しの予定の入力が規則に合わないとき（利用の終了の利用者の訪問）は、例外の回を作り直す前に 400 で拒み、Google に書かない。
func TestChangeRuleRejectsEndedPatientBeforeWriting(t *testing.T) {
	fx := newFixture(t)
	fx.seedWeekly(t, mondays)
	fx.moveToAfternoon(t, mondays[2])
	if err := (inmem.Patients{Store: fx.store}).End(editorCtx(), inmem.PatientID); err != nil {
		t.Fatal(err)
	}
	writes := fx.google.Writes()
	effective := mondays[1]
	_, err := fx.changeRule.Do(editorCtx(), inmem.FacilityID, scheduleID, nextID, fx.parentETag(t), &effective, tuesdayRule)
	if !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	if fx.google.Writes() != writes {
		t.Errorf("Google への書き込み = %d, want %d", fx.google.Writes(), writes)
	}
	if _, ok := fx.store.Records[nextID]; ok {
		t.Error("新しい親の記録ができた")
	}
}

func TestChangeRuleRejects(t *testing.T) {
	fx := newFixture(t)
	fx.seedWeekly(t, mondays)
	writes := fx.google.Writes()
	effective := mondays[1]
	do := func(id, etag string, effective *civil.Date) error {
		_, err := fx.changeRule.Do(editorCtx(), inmem.FacilityID, scheduleID, id, etag, effective, tuesdayRule)
		return err
	}

	if err := do(nextID, "", &effective); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("etag が無い: err = %v", err)
	}
	if err := do("", fx.parentETag(t), &effective); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("id が無い: err = %v", err)
	}
	past := civil.Date{Year: 2026, Month: 10, Day: 20}
	if err := do(nextID, fx.parentETag(t), &past); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Errorf("過去の適用の日: err = %v", err)
	}
	if err := do(nextID, `"old"`, &effective); !isConflict(err, calendarwrite.CodeEventChanged) {
		t.Errorf("etag が違う: err = %v", err)
	}
	fx.google.Edit(calendarID, eventID(t), func(ev *calendarv3.Event) { ev.Recurrence = []string{"RRULE:FREQ=DAILY;INTERVAL=2"} })
	if err := do(nextID, fx.parentETag(t), &effective); !errors.Is(err, apperr.ErrConflict) || isConflict(err, calendarwrite.CodeEventChanged) {
		t.Errorf("規則に写せない親: err = %v", err)
	}
	r, _ := fx.record(t)
	r.Pending = &calendar.PendingWrite{Version: 2, State: calendar.PendingUnknown, Deadline: fx.now}
	fx.store.Records[scheduleID] = r
	if err := do(nextID, fx.parentETag(t), &effective); !isConflict(err, calendarwrite.CodeWritePending) {
		t.Errorf("保留の版がある親: err = %v", err)
	}
	if fx.google.Writes() != writes {
		t.Errorf("Google への書き込み = %d, want %d", fx.google.Writes(), writes)
	}
	if _, ok := fx.store.Records[nextID]; ok {
		t.Error("新しい親の記録ができた")
	}
}
