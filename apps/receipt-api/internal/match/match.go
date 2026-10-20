// Package match は、予定と実績の行を、突き合わせのキーで対にする。
package match

import (
	"cmp"
	"slices"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
)

// Pair は、突き合わせた予定と実績である。片方にしかない行では、もう片方が nil である。
type Pair struct {
	Schedule *record.Record
	Visit    *record.Record
}

// Pairs は、キー（訪問日、利用者名、主訪問者）が同じ予定と実績を対にする。
// 同じキーの行が片方に 2 つ以上あるときは、開始時間の差が小さい組から順に対にし、
// 対にならなかった行は片方だけの Pair にする。
func Pairs(schedules, visits []record.Record) []Pair {
	type group struct {
		schedules, visits []record.Record
	}
	groups := map[record.Key]*group{}
	var keys []record.Key
	get := func(k record.Key) *group {
		g, ok := groups[k]
		if !ok {
			g = &group{}
			groups[k] = g
			keys = append(keys, k)
		}
		return g
	}
	for _, s := range schedules {
		g := get(s.Key)
		g.schedules = append(g.schedules, s)
	}
	for _, v := range visits {
		g := get(v.Key)
		g.visits = append(g.visits, v)
	}

	var pairs []Pair
	for _, k := range keys {
		g := groups[k]
		pairs = append(pairs, pairGroup(g.schedules, g.visits)...)
	}
	return pairs
}

// pairGroup は、同じキーの行を、開始時間の差が最小の組から貪欲に対にする。
// 差が同じ組は、予定、実績の開始時間の早い順に選ぶ。
func pairGroup(schedules, visits []record.Record) []Pair {
	byStart := func(a, b record.Record) int {
		return cmp.Or(cmp.Compare(a.Start, b.Start), cmp.Compare(a.End, b.End), cmp.Compare(a.Line, b.Line))
	}
	slices.SortStableFunc(schedules, byStart)
	slices.SortStableFunc(visits, byStart)

	type candidate struct{ s, v, diff int }
	candidates := make([]candidate, 0, len(schedules)*len(visits))
	for i := range schedules {
		for j := range visits {
			d := int(schedules[i].Start - visits[j].Start)
			candidates = append(candidates, candidate{i, j, max(d, -d)})
		}
	}
	slices.SortStableFunc(candidates, func(a, b candidate) int {
		return cmp.Or(cmp.Compare(a.diff, b.diff), cmp.Compare(a.s, b.s), cmp.Compare(a.v, b.v))
	})

	usedS := make([]bool, len(schedules))
	usedV := make([]bool, len(visits))
	var pairs []Pair
	for _, c := range candidates {
		if usedS[c.s] || usedV[c.v] {
			continue
		}
		usedS[c.s], usedV[c.v] = true, true
		pairs = append(pairs, Pair{Schedule: &schedules[c.s], Visit: &visits[c.v]})
	}
	for i := range schedules {
		if !usedS[i] {
			pairs = append(pairs, Pair{Schedule: &schedules[i]})
		}
	}
	for j := range visits {
		if !usedV[j] {
			pairs = append(pairs, Pair{Visit: &visits[j]})
		}
	}
	return pairs
}
