// Package judge は、対にした予定と実績が整合するかを判定し、4 つの区分に分ける。
package judge

import (
	"cmp"
	"slices"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/match"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/servicerule"
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

// RequiredAddition は、整合とする加算の値である。加算①〜加算⑤のうちこの値の 1 つだけが入っているときに整合とする。
const RequiredAddition = "通常"

// Check は、1 つの項目の判定である。
type Check struct {
	OK bool `json:"ok"`
}

// RangeCheck は、分の値が許容範囲に入るかの判定である。
type RangeCheck struct {
	OK bool `json:"ok"`
	// Minutes は判定した分である。提供時間が空なら nil である。
	Minutes *int `json:"minutes"`
	// Range は許容範囲である。範囲を持たないサービス内容なら nil である。
	Range *servicerule.Range `json:"range"`
}

// Checks は、予定と実績の対の、項目ごとの判定である。
type Checks struct {
	Start   Check `json:"start"`
	Service Check `json:"service"`
	// ScheduleElapsed と VisitElapsed は、終了時間から開始時間を引いた分の判定である。
	ScheduleElapsed  RangeCheck `json:"schedule_elapsed"`
	VisitElapsed     RangeCheck `json:"visit_elapsed"`
	ScheduleDuration RangeCheck `json:"schedule_duration"`
	VisitDuration    RangeCheck `json:"visit_duration"`
	Additions        Check      `json:"additions"`
	// DurationEqual と EndEqual は、両側の値が同じかである。区分には影響せず、注記にだけ使う。
	DurationEqual bool `json:"duration_equal"`
	EndEqual      bool `json:"end_equal"`
}

// Consistent は、区分を決める項目がすべて整合するかを返す。
func (c Checks) Consistent() bool {
	return c.Start.OK && c.Service.OK &&
		c.ScheduleElapsed.OK && c.VisitElapsed.OK &&
		c.ScheduleDuration.OK && c.VisitDuration.OK &&
		c.Additions.OK
}

// Side は、結果の行の片側の値である。
type Side struct {
	Line     int         `json:"line"`
	Start    civil.Clock `json:"start"`
	End      civil.Clock `json:"end"`
	Duration *int        `json:"duration"`
	Service  string      `json:"service"`
	// Additions は実績の加算を ", " でつないだものである。予定の側では省く。
	Additions *string `json:"additions,omitempty"`
}

// Result は、照合の結果の 1 行である。
type Result struct {
	Category Category   `json:"category"`
	Date     civil.Date `json:"date"`
	Client   string     `json:"client"`
	Staff    string     `json:"staff"`
	Schedule *Side      `json:"schedule"`
	Visit    *Side      `json:"visit"`
	// Checks は、予定と実績の両方があるときだけ持つ。
	Checks *Checks `json:"checks"`
}

// All は、対ごとに判定し、Categories の区分の順、訪問日、開始時間、利用者名、主訪問者の順に並べて返す。
func All(pairs []match.Pair) []Result {
	results := make([]Result, 0, len(pairs))
	for _, p := range pairs {
		results = append(results, Judge(p))
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

// Judge は、1 つの対を判定する。p の Schedule と Visit の少なくとも一方は nil でない前提である。
func Judge(p match.Pair) Result {
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
		if c.Consistent() {
			r.Category = Match
		}
	}
	return r
}

func side(rec record.Record, visit bool) *Side {
	s := &Side{
		Line:     rec.Line,
		Start:    rec.Start,
		End:      rec.End,
		Duration: rec.Duration,
		Service:  rec.Service,
	}
	if visit {
		a := rec.AdditionText()
		s.Additions = &a
	}
	return s
}

func check(s, v record.Record) Checks {
	return Checks{
		Start:            Check{OK: s.Start == v.Start},
		Service:          Check{OK: servicerule.ServiceMatches(s.Service, v.Service)},
		ScheduleElapsed:  inRange(s.Service, new(s.Elapsed())),
		VisitElapsed:     inRange(v.Service, new(v.Elapsed())),
		ScheduleDuration: inRange(s.Service, s.Duration),
		VisitDuration:    inRange(v.Service, v.Duration),
		Additions:        Check{OK: v.AdditionText() == RequiredAddition},
		DurationEqual:    s.Duration != nil && v.Duration != nil && *s.Duration == *v.Duration,
		EndEqual:         s.End == v.End,
	}
}

func inRange(service string, minutes *int) RangeCheck {
	c := RangeCheck{Minutes: minutes}
	r, ok := servicerule.Lookup(service)
	if !ok {
		return c
	}
	c.Range = &r
	c.OK = minutes != nil && r.Contains(*minutes)
	return c
}
