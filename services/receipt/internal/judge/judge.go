// Package judge は、対にした予定と実績が整合するかを判定し、4 つの区分に分ける。
package judge

import (
	"cmp"
	"slices"

	"github.com/Fukuemon/buddy/packages/go/servicecode"

	"github.com/Fukuemon/buddy/services/receipt/internal/civil"
	"github.com/Fukuemon/buddy/services/receipt/internal/match"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
	"github.com/Fukuemon/buddy/services/receipt/internal/servicerule"
)

// Category は、照合の結果の区分である。
type Category string

// 区分。Categories の順に並べて出す。
const (
	Mismatch     Category = "mismatch"
	ScheduleOnly Category = "schedule_only"
	VisitOnly    Category = "visit_only"
	Match        Category = "match"
)

// Categories は、結果を並べる区分の順を返す。
func Categories() []Category {
	return []Category{Mismatch, ScheduleOnly, VisitOnly, Match}
}

// requiredAddition は、時間帯を問わずに整合とする加算の値である。加算①〜加算⑤のうちこの値の 1 つだけが入っているときに整合とする。
const requiredAddition = "通常"

// 時間帯の加算の値。加算①〜加算⑤のうちこの値の 1 つだけが入り、予定の開始時間が timeBandOf の時間帯に入るときに整合とする。
// AdditionLateNight は、電子カルテの実績で確認していない値で、名前は推測である。
const (
	AdditionEarlyMorning = "早朝"
	AdditionNight        = "夜間"
	AdditionLateNight    = "深夜"
)

// timeBandOf は、開始時間が入る時間帯の加算の値を返す。
// 早朝は 6:00 以上 8:00 未満、夜間は 18:00 以上 22:00 未満、深夜は 22:00 以上か 6:00 未満である。
// どの時間帯にも入らなければ ok は false である。
func timeBandOf(start civil.Clock) (addition string, ok bool) {
	const hour = 60
	switch {
	case start < 6*hour || start >= 22*hour:
		return AdditionLateNight, true
	case start < 8*hour:
		return AdditionEarlyMorning, true
	case start >= 18*hour:
		return AdditionNight, true
	}
	return "", false
}

// isValidAdditions は、実績の加算が、予定の開始時間に対して規則に合うかを返す。
// 「通常」か、開始時間の時間帯の加算の 1 つだけのときに合う。緊急時の訪問の加算を含むときと、2 つ以上並ぶときは合わない。
func isValidAdditions(scheduleStart civil.Clock, additions []string) bool {
	if len(additions) != 1 {
		return false
	}
	if additions[0] == requiredAddition {
		return true
	}
	band, ok := timeBandOf(scheduleStart)
	return ok && additions[0] == band
}

// Check は、1 つの項目の判定である。
type Check struct {
	OK bool
}

// RangeCheck は、分の値が許容範囲に入るかの判定である。
type RangeCheck struct {
	OK bool
	// Minutes は判定した分である。提供時間が空なら nil である。
	Minutes *int
	// Range は許容範囲である。範囲を持たないサービス内容なら nil である。
	Range *servicecode.Range
}

// Checks は、予定と実績の対の、項目ごとの判定である。
type Checks struct {
	Start   Check
	Service Check
	// ScheduleElapsed と VisitElapsed は、終了時間から開始時間を引いた分の判定である。
	ScheduleElapsed  RangeCheck
	VisitElapsed     RangeCheck
	ScheduleDuration RangeCheck
	VisitDuration    RangeCheck
	Additions        Check
	// DurationEqual と EndEqual は、両側の値が同じかである。区分には影響せず、注記にだけ使う。
	DurationEqual bool
	EndEqual      bool
}

// IsConsistent は、区分を決める項目がすべて整合するかを返す。
func (c Checks) IsConsistent() bool {
	return c.Start.OK && c.Service.OK &&
		c.ScheduleElapsed.OK && c.VisitElapsed.OK &&
		c.ScheduleDuration.OK && c.VisitDuration.OK &&
		c.Additions.OK
}

// Side は、結果の行の片側の値である。
type Side struct {
	Line     int
	Start    civil.Clock
	End      civil.Clock
	Duration *int
	Service  string
	// Additions は実績の加算を ", " でつないだものである。予定の側では省く。
	Additions *string
}

// Result は、照合の結果の 1 行である。
type Result struct {
	Category Category
	Date     civil.Date
	Client   string
	Staff    string
	Schedule *Side
	Visit    *Side
	// Checks は、予定と実績の両方があるときだけ持つ。
	Checks *Checks
}

// All は、対ごとに判定し、Categories の区分の順、訪問日、開始時間、利用者名、主訪問者の順に並べて返す。
func All(pairs []match.Pair) []Result {
	results := make([]Result, 0, len(pairs))
	for _, p := range pairs {
		results = append(results, judgePair(p))
	}
	order := map[Category]int{}
	for i, c := range Categories() {
		order[c] = i
	}
	slices.SortStableFunc(results, func(a, b Result) int {
		return cmp.Or(
			cmp.Compare(order[a.Category], order[b.Category]),
			a.Date.Compare(b.Date),
			cmp.Compare(a.start(), b.start()),
			cmp.Compare(a.Client, b.Client),
			cmp.Compare(a.Staff, b.Staff),
		)
	})
	return results
}

func (r Result) start() civil.Clock {
	if r.Schedule != nil {
		return r.Schedule.Start
	}
	return r.Visit.Start
}

// judgePair は、1 つの対を判定する。p の Schedule と Visit の少なくとも一方は nil でない前提である。
func judgePair(p match.Pair) Result {
	var key record.Key
	if p.Schedule != nil {
		key = p.Schedule.Key
	} else {
		key = p.Visit.Key
	}
	r := Result{Date: key.Date, Client: key.Client, Staff: key.Staff}
	if p.Schedule != nil {
		r.Schedule = side(*p.Schedule, false)
	}
	if p.Visit != nil {
		r.Visit = side(*p.Visit, true)
	}
	switch {
	case p.Visit == nil:
		r.Category = ScheduleOnly
	case p.Schedule == nil:
		r.Category = VisitOnly
	default:
		c := check(*p.Schedule, *p.Visit)
		r.Checks = &c
		r.Category = Mismatch
		if c.IsConsistent() {
			r.Category = Match
		}
	}
	return r
}

func side(rec record.Record, describesVisit bool) *Side {
	s := &Side{
		Line:     rec.Line,
		Start:    rec.Start,
		End:      rec.End,
		Duration: rec.Duration,
		Service:  rec.Service,
	}
	if describesVisit {
		a := rec.AdditionText()
		s.Additions = &a
	}
	return s
}

func check(s, v record.Record) Checks {
	return Checks{
		Start:            Check{OK: s.Start == v.Start},
		Service:          Check{OK: servicerule.IsMatchingService(s.Service, v.Service)},
		ScheduleElapsed:  inRange(s.Service, new(s.Elapsed())),
		VisitElapsed:     inRange(v.Service, new(v.Elapsed())),
		ScheduleDuration: inRange(s.Service, s.Duration),
		VisitDuration:    inRange(v.Service, v.Duration),
		Additions:        Check{OK: isValidAdditions(s.Start, v.Additions)},
		DurationEqual:    s.Duration != nil && v.Duration != nil && *s.Duration == *v.Duration,
		EndEqual:         s.End == v.End,
	}
}

func inRange(service string, minutes *int) RangeCheck {
	c := RangeCheck{Minutes: minutes}
	r, ok := servicecode.Lookup(service)
	if !ok {
		return c
	}
	c.Range = &r
	c.OK = minutes != nil && r.Contains(*minutes)
	return c
}
