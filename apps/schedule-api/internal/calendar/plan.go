package calendar

import (
	"crypto/sha256"
	"encoding/hex"
	"slices"
	"strings"
	"time"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/apperr"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/schedule"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/visit"
)

// SkipServiceNotFound は、タイトルから読んだサービス内容が、サービスコードのマスタに無い予定である。
const SkipServiceNotFound SkipReason = "service_not_found"

// Range は、取り込む予定の期間で、両端の日を含む。予定はこの期間に始まるものを取り込む。
type Range struct {
	Start civil.Date
	End   civil.Date
}

// NewRange は、開始が終了より後でなく、期間が 1 年を超えないことを検証して Range を作る。
func NewRange(start, end civil.Date) (Range, error) {
	if end.Before(start) {
		return Range{}, apperr.Invalid("期間の終了日は開始日以降の日付にします")
	}
	if !end.Before(civil.DateOf(start.Time().AddDate(1, 0, 0))) {
		return Range{}, apperr.Invalid("期間は 1 年までにします")
	}
	return Range{Start: start, End: end}, nil
}

// TimeMin と TimeMax は、期間の始まりと、終了日の翌日の始まりの Asia/Tokyo の時刻である。
func (r Range) TimeMin() time.Time { return midnight(r.Start) }

// TimeMax は、期間の終了日の翌日の始まりの Asia/Tokyo の時刻である。
func (r Range) TimeMax() time.Time { return midnight(civil.DateOf(r.End.Time().AddDate(0, 0, 1))) }

// movedMargin は、期間の中の回を動かした先として探す、期間の前後の日数である。
// Google は、変えた回を、元の日時ではなく今の日時で期間に絞るためである。
const movedMargin = 31

// widened は、期間の前後を movedMargin の日だけ広げた期間である。期間の中の回を外へ動かした例外の回を読むのに使う。
func (r Range) widened() Range {
	return Range{Start: civil.DateOf(r.Start.Time().AddDate(0, 0, -movedMargin)), End: civil.DateOf(r.End.Time().AddDate(0, 0, movedMargin))}
}

// Contains は、d が期間の中の日かを返す。
func (r Range) Contains(d civil.Date) bool { return !d.Before(r.Start) && !d.After(r.End) }

func midnight(d civil.Date) time.Time {
	return time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, tokyo)
}

// PatientRef は、タイトルの利用者名で引く利用者である。
type PatientRef struct {
	ID                string
	Name              string
	AssignedStaffName string
}

// ReviewReason は、予定を取り込む前に確かめが要る理由である。
type ReviewReason string

// ReviewReason の値。
const (
	// ReviewPatientNotFound は、タイトルの利用者名の利用者がいない予定である。
	ReviewPatientNotFound ReviewReason = "patient_not_found"
	// ReviewPatientAmbiguous は、タイトルの利用者名の利用者が 2 人以上いる予定である。
	ReviewPatientAmbiguous ReviewReason = "patient_ambiguous"
)

// ReviewItem は、取り込む前に取り込み方を選ぶ予定である。繰り返しの予定とその回は、1 つの ReviewItem にまとめる。
type ReviewItem struct {
	// ExternalEventID は、取り込み方を送るときの外部の予定の ID である。繰り返しの予定とその回では、親の予定の ID である。
	ExternalEventID string
	Date            civil.Date
	StartTime       civil.Time
	EndTime         civil.Time
	Service         string
	Client          string
	Reason          ReviewReason
	// Recurrence は、繰り返しのまま取り込む予定の規則で、ほかの予定では nil である。
	Recurrence *schedule.Rule
	// Candidates は、タイトルの利用者名の利用者で、ReviewPatientAmbiguous のときだけ持つ。
	Candidates []PatientRef
	// Revision は、まとめた外部の予定の ID と etag から作る版である。プレビューの後に予定が変わると変わる。
	Revision string
}

// Skipped は、取り込まない予定の、読めた日時と理由である。タイトルは利用者名を含むので持たない。
type Skipped struct {
	Date      *civil.Date
	StartTime *civil.Time
	EndTime   *civil.Time
	AllDay    bool
	Reason    SkipReason
}

// Counts は、プレビューの件数である。予定は外部の予定の数で数え、繰り返しのまま取り込む予定は 1 件、回ごとにした予定は 1 回を 1 件に数える。
type Counts struct {
	// Import は、確かめが要る予定を除いて、取り込む予定の数である。ImportVisit と ImportNormal に分かれる。
	Import       int
	ImportVisit  int
	ImportNormal int
	// ExpandedOccurrences は、Import のうち、繰り返しを回ごとにした回の数である。
	ExpandedOccurrences int
	// Recurring は、取り込む繰り返しの予定の数で、RecurringAsRule と RecurringExpanded に分かれる。
	Recurring         int
	RecurringAsRule   int
	RecurringExpanded int
	NeedsReview       int
	Skipped           int
	AlreadyImported   int
}

// Preview は、取り込みのプレビューである。
type Preview struct {
	Range       Range
	Counts      Counts
	NeedsReview []ReviewItem
	Skipped     []Skipped
}

// Action は、確かめが要る予定の取り込み方である。
type Action string

// Action の値。
const (
	// ActionPatient は、選んだ利用者の訪問の予定にする。
	ActionPatient Action = "patient"
	// ActionNormal は、外部の予定のタイトルをそのまま使う通常の予定にする。
	ActionNormal Action = "normal"
	// ActionSkip は、取り込まない。
	ActionSkip Action = "skip"
)

// Decision は、確かめが要る予定 1 件の取り込み方である。PatientID は ActionPatient のときだけ持つ。
// Revision は、取り込み方を選んだプレビューの ReviewItem.Revision である。
type Decision struct {
	ExternalEventID string
	Action          Action
	PatientID       string
	Revision        string
}

// entry は、取り込みで書く予定 1 件である。
type entry struct {
	event    Event
	parentID string
	cand     Candidate
	// rule は、繰り返しのまま取り込む親の予定の規則である。
	rule *Recurrence
	// replaces は、繰り返しの予定の回を置き換える単発の予定の、元の回である。
	replaces *replacement
	expanded bool
	// patientID と serviceCodeID は、訪問の予定の参照である。確かめが要る予定では patientID が空である。
	patientID     string
	serviceCodeID string
	// reviewKey は、確かめが要る予定の ReviewItem.ExternalEventID で、ほかの予定では空である。
	reviewKey string
}

// replacement は、繰り返しの予定の回である。parentEventID はこの取り込みで作る繰り返しの予定の親を、
// recurringScheduleID は前の取り込みで作った繰り返しの予定を指し、どちらか 1 つを持つ。
type replacement struct {
	parentEventID       string
	recurringScheduleID string
	date                civil.Date
}

// plan は、外部の予定を読み替えた、取り込みで書く予定と、除外する日と、プレビューの内容である。
type plan struct {
	entries    []entry
	exclusions []replacement
	review     []ReviewItem
	skipped    []Skipped
	counts     Counts
}

// planInput は、buildPlan の入力である。
type planInput struct {
	rng    Range
	events []Event
	// instances は、回ごとにする繰り返しの親の予定の ID ごとの、期間の回である。
	instances map[string][]Event
	// links は、前の取り込みの予定の対応を、外部の予定の ID で引く。
	links map[string]Link
	// linkedRecurring は、前の取り込みで繰り返しのまま取り込んだ予定を、親の予定の ID で引く。
	linkedRecurring map[string]schedule.RecurringDetail
	patients        []PatientRef
	serviceCodes    []visit.ServiceCode
}

// parentMode は、繰り返しの親の予定の取り込み方である。
type parentMode int

const (
	parentSkipped parentMode = iota
	parentRule
	parentExpanded
)

// classifyParent は、繰り返しの親の予定を、規則のまま取り込むか、回ごとにするか、取り込まないかに分ける。
func classifyParent(ev Event) (parentMode, Candidate, *Recurrence) {
	c := Classify(ev)
	if c.Kind == KindSkipped {
		return parentSkipped, c, nil
	}
	rec, err := RuleFromRecurrence(ev)
	if err != nil {
		return parentExpanded, c, nil
	}
	return parentRule, c, &rec
}

// modeOf は、親の予定の取り込み方を、前の取り込みの予定の対応に合わせて決める。
// 親に対応が無く、親の回か例外の回に対応があれば、前の取り込みで親を繰り返しにしていないので、回ごとにする。
// 規則に写せる形に変わっていても規則ごと作ると、前に取り込んだ回と重なるためである。
func modeOf(ev Event, links map[string]Link) (parentMode, Candidate, *Recurrence) {
	mode, c, rec := classifyParent(ev)
	if mode != parentRule {
		return mode, c, rec
	}
	for _, l := range links {
		if l.RecurringEventID != nil && *l.RecurringEventID == ev.ID {
			return parentExpanded, c, nil
		}
	}
	return mode, c, rec
}

// parentsToExpand は、events のうち、回ごとにする繰り返しの親の予定の ID を返す。前の取り込みで結び付けた親は除く。
func parentsToExpand(events []Event, links map[string]Link) []string {
	var ids []string
	for _, ev := range events {
		if len(ev.Recurrence) == 0 || ev.Status == StatusCancelled {
			continue
		}
		if _, ok := links[ev.ID]; ok {
			continue
		}
		if mode, _, _ := modeOf(ev, links); mode == parentExpanded {
			ids = append(ids, ev.ID)
		}
	}
	return ids
}

// buildPlan は、外部の予定を buddy の予定に読み替え、取り込みで書く予定とプレビューの内容を作る。
// 読み替えの規則は、画面仕様書の予定の取り込みの「予定の読み替え」にある。
func buildPlan(in planInput) plan {
	b := planner{
		in: in, reviewIndex: map[string]int{}, parents: map[string]Event{}, ruleParents: map[string]*Recurrence{},
		expandedParents: map[string]bool{}, instanceIDs: map[string]bool{}, countedParents: map[string]bool{},
	}
	b.serviceIDs = make(map[string]string, len(in.serviceCodes))
	for _, sc := range in.serviceCodes {
		b.serviceIDs[serviceKey(sc.Code)] = sc.ID
	}
	var exceptions []Event
	for _, ev := range in.events {
		switch {
		case len(ev.Recurrence) > 0:
			b.parents[ev.ID] = ev
		case ev.RecurringEventID != "":
			exceptions = append(exceptions, ev)
		}
	}
	for _, ev := range in.events {
		switch {
		case len(ev.Recurrence) > 0:
			b.addParent(ev)
		case ev.RecurringEventID == "":
			b.addSingle(ev)
		}
	}
	for _, ev := range exceptions {
		b.addException(ev)
	}
	b.setRevisions()
	b.sortOutputs()
	return b.p
}

// setRevisions は、確かめが要る予定ごとに、まとめた外部の予定の ID と etag から版を作る。
// 確定は版を比べ、プレビューの後にタイトルや時刻が変わった予定に、前の取り込み方を当てない。
func (b *planner) setRevisions() {
	parts := map[string][]string{}
	for _, e := range b.p.entries {
		if e.reviewKey != "" {
			parts[e.reviewKey] = append(parts[e.reviewKey], e.event.ID+"\x00"+e.event.ETag)
		}
	}
	for i := range b.p.review {
		ps := parts[b.p.review[i].ExternalEventID]
		slices.Sort(ps)
		sum := sha256.Sum256([]byte(strings.Join(ps, "\x01")))
		b.p.review[i].Revision = hex.EncodeToString(sum[:8])
	}
}

type planner struct {
	in          planInput
	p           plan
	serviceIDs  map[string]string
	reviewIndex map[string]int
	parents     map[string]Event
	// ruleParents は、この取り込みで繰り返しのまま取り込む親の予定の規則である。
	ruleParents map[string]*Recurrence
	// expandedParents は、この取り込みで回ごとにした親の予定である。
	expandedParents map[string]bool
	// instanceIDs は、回ごとにした親の Instances が返した回の ID である。
	instanceIDs map[string]bool
	// countedParents は、取り込む繰り返しの予定として数えた、回ごとにした親の予定である。
	countedParents map[string]bool
}

func (b *planner) linked(id string) bool {
	if _, ok := b.in.links[id]; ok {
		b.p.counts.AlreadyImported++
		return true
	}
	return false
}

func (b *planner) addSingle(ev Event) {
	if ev.Status == StatusCancelled {
		return
	}
	c := Classify(ev)
	if !c.Date.IsZero() && !b.in.rng.Contains(c.Date) {
		return
	}
	if b.linked(ev.ID) {
		return
	}
	b.add(entry{event: ev, cand: c})
}

func (b *planner) addParent(ev Event) {
	if ev.Status == StatusCancelled || b.linked(ev.ID) {
		return
	}
	mode, c, rec := modeOf(ev, b.in.links)
	switch mode {
	case parentSkipped:
		b.skip(c)
	case parentRule:
		b.ruleParents[ev.ID] = rec
		b.add(entry{event: ev, cand: c, rule: rec})
	case parentExpanded:
		b.expandedParents[ev.ID] = true
		imported := false
		for _, inst := range b.in.instances[ev.ID] {
			b.instanceIDs[inst.ID] = true
			if inst.Status == StatusCancelled {
				continue
			}
			ic := Classify(inst)
			if !ic.Date.IsZero() && !b.in.rng.Contains(ic.Date) {
				continue
			}
			if b.linked(inst.ID) {
				continue
			}
			if b.add(entry{event: inst, parentID: ev.ID, cand: ic, expanded: true}) {
				imported = true
			}
		}
		if imported {
			b.countExpanded(ev.ID)
		}
	}
}

// countExpanded は、回ごとにした親の予定を、取り込む繰り返しの予定として 1 回だけ数える。
func (b *planner) countExpanded(parentID string) {
	if b.countedParents[parentID] {
		return
	}
	b.countedParents[parentID] = true
	b.p.counts.Recurring++
	b.p.counts.RecurringExpanded++
}

// addException は、繰り返しの予定の変えた回か取り消した回を読み替える。
// 親を回ごとにしたときは、回が Instances に含まれるので何もしない。ただし、期間の中の回を期間の外へ動かした回は
// Instances に含まれないので、回として足す。
// 親を繰り返しのまま取り込むとき（この取り込みか前の取り込み）は、取り消した回を除外する日にし、変えた回を回の置き換えにする。
// 親が無いか取り込まないときは、変えた回を単発の予定にし、取り消した回は何もしない。
func (b *planner) addException(ev Event) {
	if b.expandedParents[ev.RecurringEventID] {
		if ev.Status != StatusCancelled && !b.instanceIDs[ev.ID] && !b.linked(ev.ID) {
			if b.add(entry{event: ev, parentID: ev.RecurringEventID, cand: Classify(ev), expanded: true}) {
				b.countExpanded(ev.RecurringEventID)
			}
		}
		return
	}
	target, ok := b.replacementTarget(ev)
	if ev.Status == StatusCancelled {
		if ok {
			b.p.exclusions = append(b.p.exclusions, target)
		}
		return
	}
	c := Classify(ev)
	if original, ok := originalDate(ev); (c.Date.IsZero() || !b.in.rng.Contains(c.Date)) && (!ok || !b.in.rng.Contains(original)) {
		return
	}
	if b.linked(ev.ID) {
		return
	}
	if !ok {
		if b.excludedBefore(ev) {
			// 前の取り込みか buddy で、その回をすでに除外か置き換えにした。
			b.p.counts.AlreadyImported++
			return
		}
		b.add(entry{event: ev, parentID: ev.RecurringEventID, cand: c})
		return
	}
	if c.Kind == KindSkipped {
		b.p.exclusions = append(b.p.exclusions, target)
		b.skip(c)
		return
	}
	// サービスコードを引けずに取り込まない回も、元の日の回を残さない
	before := len(b.p.entries)
	b.add(entry{event: ev, parentID: ev.RecurringEventID, cand: c, replaces: &target})
	if len(b.p.entries) == before {
		b.p.exclusions = append(b.p.exclusions, target)
	}
}

// replacementTarget は、例外の回 ev が置き換える、繰り返しのまま取り込む予定の回を返す。
// 親を繰り返しのまま取り込まないか、元の日付が規則の回に当たらないか、前の取り込みの繰り返しの予定でその日をすでに除外したときは false を返す。
func (b *planner) replacementTarget(ev Event) (replacement, bool) {
	date, ok := originalDate(ev)
	if !ok {
		return replacement{}, false
	}
	if rec := b.ruleParents[ev.RecurringEventID]; rec != nil {
		parent := b.parents[ev.RecurringEventID]
		pc := Classify(parent)
		rs := schedule.RecurringSchedule{Slot: schedule.Slot{Date: pc.Date}, Rule: rec.Rule}
		if !rs.Occurs(date) || slices.Contains(rec.ExclusionDates, date) {
			return replacement{}, false
		}
		return replacement{parentEventID: ev.RecurringEventID, date: date}, true
	}
	rs, ok := b.in.linkedRecurring[ev.RecurringEventID]
	if !ok || !rs.Occurs(date) || slices.Contains(rs.ExclusionDates, date) {
		return replacement{}, false
	}
	return replacement{recurringScheduleID: rs.ID, date: date}, true
}

// excludedBefore は、例外の回 ev の親が前の取り込みの繰り返しの予定で、その元の日付をすでに除外しているかを返す。
func (b *planner) excludedBefore(ev Event) bool {
	date, ok := originalDate(ev)
	if !ok {
		return false
	}
	rs, ok := b.in.linkedRecurring[ev.RecurringEventID]
	return ok && slices.Contains(rs.ExclusionDates, date)
}

// originalDate は、例外の回が元の規則で始まるはずだった Asia/Tokyo の日付を返す。
func originalDate(ev Event) (civil.Date, bool) {
	if ev.OriginalStart.DateTime != "" {
		t, err := ev.OriginalStart.Instant()
		if err != nil {
			return civil.Date{}, false
		}
		return civil.DateOf(t.In(tokyo)), true
	}
	d, err := civil.ParseDate(ev.OriginalStart.Date)
	return d, err == nil
}

// add は、予定を取り込む予定か確かめが要る予定に足し、取り込まない予定なら取り込まない予定に足す。取り込む予定に足したときは true を返す。
func (b *planner) add(e entry) bool {
	if e.cand.Kind == KindSkipped {
		b.skip(e.cand)
		return false
	}
	if e.cand.Kind == KindVisit {
		id, ok := b.serviceIDs[serviceKey(e.cand.Service)]
		if !ok {
			b.skip(Candidate{Date: e.cand.Date, StartTime: e.cand.StartTime, EndTime: e.cand.EndTime, SkipReason: SkipServiceNotFound})
			return false
		}
		e.serviceCodeID = id
		matches := b.matchPatients(e.cand.Client)
		if len(matches) == 1 {
			e.patientID = matches[0].ID
		} else {
			e.reviewKey = b.review(e, matches)
		}
	}
	b.p.entries = append(b.p.entries, e)
	if e.reviewKey != "" {
		return false
	}
	c := &b.p.counts
	c.Import++
	if e.cand.Kind == KindVisit {
		c.ImportVisit++
	} else {
		c.ImportNormal++
	}
	if e.expanded {
		c.ExpandedOccurrences++
	}
	if e.rule != nil {
		c.Recurring++
		c.RecurringAsRule++
	}
	return true
}

// review は、確かめが要る予定 e の ReviewItem を足し、そのキーを返す。親の予定とタイトルが同じ回は、親の ReviewItem にまとめる。
func (b *planner) review(e entry, matches []PatientRef) string {
	key := e.event.ID
	if e.parentID != "" && e.event.Summary == b.parents[e.parentID].Summary {
		key = e.parentID
	}
	if _, ok := b.reviewIndex[key]; ok {
		return key
	}
	item := ReviewItem{
		ExternalEventID: key,
		Date:            e.cand.Date,
		StartTime:       e.cand.StartTime,
		EndTime:         e.cand.EndTime,
		Service:         e.cand.Service,
		Client:          e.cand.Client,
		Reason:          ReviewPatientNotFound,
	}
	if len(matches) > 1 {
		item.Reason, item.Candidates = ReviewPatientAmbiguous, matches
	}
	if e.rule != nil {
		rule := e.rule.Rule
		item.Recurrence = &rule
	}
	b.reviewIndex[key] = len(b.p.review)
	b.p.review = append(b.p.review, item)
	b.p.counts.NeedsReview++
	return key
}

func (b *planner) skip(c Candidate) {
	s := Skipped{Reason: c.SkipReason, AllDay: c.SkipReason == SkipAllDay}
	if !c.Date.IsZero() {
		d := c.Date
		s.Date = &d
	}
	if c.StartTime.Before(c.EndTime) || c.SkipReason == SkipMultiDay || c.SkipReason == SkipZeroLength || c.SkipReason == SkipServiceNotFound {
		st, et := c.StartTime, c.EndTime
		s.StartTime, s.EndTime = &st, &et
	}
	b.p.skipped = append(b.p.skipped, s)
	b.p.counts.Skipped++
}

func (b *planner) matchPatients(client string) []PatientRef {
	key := gcaltitle.NormalizeClient(client)
	var out []PatientRef
	for _, p := range b.in.patients {
		if gcaltitle.NormalizeClient(p.Name) == key {
			out = append(out, p)
		}
	}
	return out
}

// sortOutputs は、確かめが要る予定を日時の順に、取り込まない予定を日時の順（日時の無い予定は最後）に並べる。
func (b *planner) sortOutputs() {
	slices.SortStableFunc(b.p.review, func(x, y ReviewItem) int {
		return compareSlot(&x.Date, &x.StartTime, &y.Date, &y.StartTime)
	})
	slices.SortStableFunc(b.p.skipped, func(x, y Skipped) int {
		return compareSlot(x.Date, x.StartTime, y.Date, y.StartTime)
	})
}

func compareSlot(da *civil.Date, ta *civil.Time, db *civil.Date, tb *civil.Time) int {
	switch {
	case da == nil && db == nil:
		return 0
	case da == nil:
		return 1
	case db == nil:
		return -1
	}
	if c := da.Time().Compare(db.Time()); c != 0 {
		return c
	}
	ma, mb := -1, -1
	if ta != nil {
		ma = ta.Minutes()
	}
	if tb != nil {
		mb = tb.Minutes()
	}
	return ma - mb
}

// serviceAliases は、照合の API が同じサービス内容とみなす、マスタに無い書き方である。
var serviceAliases = strings.NewReplacer("予防訪看", "予防看", "予訪看", "予防看", "I５２超", "I５・２超")

// serviceKey は、サービス内容を、照合の API と同じ規則で表記をそろえ、マスタのコードと比べる値にする。
func serviceKey(s string) string {
	return serviceAliases.Replace(gcaltitle.NormalizeService(strings.TrimSpace(s)))
}

// applyDecisions は、確かめが要る予定に decisions の取り込み方を当てる。
// decisions の予定の集合が確かめが要る予定の集合と違うときは apperr.ErrConflict を、
// 取り込み方の値が誤っているか、選んだ利用者が patients にいないときは入力のエラーを返す。
// 取り込まないを選んだ予定の数を返す。
func (p *plan) applyDecisions(decisions []Decision, patients []PatientRef) (int, error) {
	byKey := make(map[string]Decision, len(decisions))
	for _, d := range decisions {
		if _, dup := byKey[d.ExternalEventID]; dup {
			return 0, apperr.Invalid("取り込み方を同じ予定に 2 回送っています")
		}
		switch d.Action {
		case ActionPatient:
			if !slices.ContainsFunc(patients, func(pr PatientRef) bool { return pr.ID == d.PatientID }) {
				return 0, apperr.Invalid("選んだ利用者 %s が見つかりません", d.PatientID)
			}
		case ActionNormal, ActionSkip:
		default:
			return 0, apperr.Invalid("取り込み方 %q は patient、normal、skip のいずれかです", d.Action)
		}
		byKey[d.ExternalEventID] = d
	}
	if len(byKey) != len(p.review) {
		return 0, errReviewChanged
	}
	for _, r := range p.review {
		if d, ok := byKey[r.ExternalEventID]; !ok || d.Revision != r.Revision {
			return 0, errReviewChanged
		}
	}
	skipped := 0
	kept := p.entries[:0]
	for _, e := range p.entries {
		if e.reviewKey == "" {
			kept = append(kept, e)
			continue
		}
		switch d := byKey[e.reviewKey]; d.Action {
		case ActionPatient:
			e.patientID = d.PatientID
		case ActionNormal:
			e.cand.Kind, e.cand.Title = KindNormal, normalTitle(e.event.Summary)
		case ActionSkip:
			skipped++
			// 置き換えの回を取り込まないときも、元の日の回を残さない
			if e.replaces != nil {
				p.exclusions = append(p.exclusions, *e.replaces)
			}
			continue
		}
		e.reviewKey = ""
		kept = append(kept, e)
	}
	p.entries = kept
	return skipped, nil
}

var errReviewChanged = apperr.ConflictCode(CodeReviewChanged, "プレビューの後に、外部のカレンダーの確かめが要る予定が変わりました。もう一度プレビューしてください")

// withMovedExceptions は、events に、around のうち元の日付が期間の中にある例外の回で、events に無いものを足す。
func withMovedExceptions(events, around []Event, rng Range) []Event {
	seen := make(map[string]bool, len(events))
	for _, ev := range events {
		seen[ev.ID] = true
	}
	for _, ev := range around {
		if ev.RecurringEventID == "" || seen[ev.ID] {
			continue
		}
		if d, ok := originalDate(ev); ok && rng.Contains(d) {
			events = append(events, ev)
			seen[ev.ID] = true
		}
	}
	return events
}
