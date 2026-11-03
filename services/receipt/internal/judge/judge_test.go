package judge

import (
	"testing"

	"github.com/Fukuemon/buddy/services/receipt/internal/civil"
	"github.com/Fukuemon/buddy/services/receipt/internal/match"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

type spec struct {
	start, end string
	duration   *int
	service    string
	additions  []string
}

func build(t *testing.T, s spec) *record.Record {
	t.Helper()
	d, _ := civil.NewDate(2024, 4, 1)
	st, err := civil.ParseClock(s.start)
	if err != nil {
		t.Fatal(err)
	}
	en, err := civil.ParseClock(s.end)
	if err != nil {
		t.Fatal(err)
	}
	return &record.Record{
		Key:   record.Key{Date: d, Client: "利用者A", Staff: "職員B"},
		Start: st, End: en, Duration: s.duration, Service: s.service, Additions: s.additions,
	}
}

func TestJudge(t *testing.T) {
	normal := []string{requiredAddition}
	baseS := spec{"09:00", "09:29", new(29), "訪看I２", nil}
	baseV := spec{"09:00", "09:29", new(29), "訪看I２", normal}
	tests := []struct {
		name  string
		s, v  spec
		want  Category
		check func(t *testing.T, c Checks)
	}{
		{name: "すべて一致", s: baseS, v: baseV, want: Match},
		{
			name: "開始時間が違う",
			s:    baseS, v: spec{"09:01", "09:30", new(29), "訪看I２", normal},
			want:  Mismatch,
			check: func(t *testing.T, c Checks) { expect(t, !c.Start.OK, "Start") },
		},
		{
			name: "サービス内容が違う",
			s:    baseS, v: spec{"09:00", "09:29", new(29), "訪看I３", normal},
			want:  Mismatch,
			check: func(t *testing.T, c Checks) { expect(t, !c.Service.OK, "Service") },
		},
		{
			name: "予定が医で実績が基本療養費",
			s:    spec{"13:00", "14:00", new(60), "医", nil},
			v:    spec{"13:00", "14:00", new(60), "基本療養費(I)", normal},
			want: Match,
		},
		{
			name: "予定が医で実績が難病等複数回訪問",
			s:    spec{"13:00", "14:00", new(60), "医", nil},
			v:    spec{"13:00", "14:00", new(60), "難病等複数回訪問加算(２回)", normal},
			want: Match,
		},
		{
			name: "実績の終了−開始が範囲外",
			s:    baseS, v: spec{"09:00", "09:30", new(29), "訪看I２", normal},
			want: Mismatch,
			check: func(t *testing.T, c Checks) {
				expect(t, !c.VisitElapsed.OK && *c.VisitElapsed.Minutes == 30 && c.VisitElapsed.Range.Max == 29, "VisitElapsed")
				expect(t, !c.EndEqual, "EndEqual")
			},
		},
		{
			name: "予定の提供時間が範囲外",
			s:    spec{"09:00", "09:29", new(19), "訪看I２", nil}, v: baseV,
			want: Mismatch,
			check: func(t *testing.T, c Checks) {
				expect(t, !c.ScheduleDuration.OK && !c.DurationEqual, "ScheduleDuration")
			},
		},
		{
			name: "提供時間が空",
			s:    baseS, v: spec{"09:00", "09:29", nil, "訪看I２", normal},
			want: Mismatch,
			check: func(t *testing.T, c Checks) {
				expect(t, !c.VisitDuration.OK && c.VisitDuration.Minutes == nil && c.VisitDuration.Range != nil, "VisitDuration")
			},
		},
		{
			name: "範囲を持たないサービス内容",
			s:    spec{"09:00", "09:29", new(29), "精神科訪看", nil},
			v:    spec{"09:00", "09:29", new(29), "精神科訪看", normal},
			want: Mismatch,
			check: func(t *testing.T, c Checks) {
				expect(t, c.ScheduleElapsed.Range == nil && !c.ScheduleElapsed.OK, "ScheduleElapsed")
			},
		},
		{
			name: "提供時間と終了時間の値の違いは区分に影響しない",
			s:    spec{"13:00", "14:00", new(60), "医", nil},
			v:    spec{"13:00", "13:50", new(50), "基本療養費(I)", normal},
			want: Match,
			check: func(t *testing.T, c Checks) {
				expect(t, !c.DurationEqual && !c.EndEqual, "注記")
			},
		},
		{name: "加算が空", s: baseS, v: spec{"09:00", "09:29", new(29), "訪看I２", []string{}}, want: Mismatch},
		{name: "加算が通常と別の加算", s: baseS, v: spec{"09:00", "09:29", new(29), "訪看I２", []string{"通常", "特別管理加算"}}, want: Mismatch},
		{name: "加算が通常以外", s: baseS, v: spec{"09:00", "09:29", new(29), "訪看I２", []string{"緊急"}}, want: Mismatch},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := judgePair(match.Pair{Schedule: build(t, tt.s), Visit: build(t, tt.v)})
			if r.Category != tt.want {
				t.Errorf("Category = %s, want %s（%+v）", r.Category, tt.want, *r.Checks)
			}
			if tt.check != nil {
				tt.check(t, *r.Checks)
			}
		})
	}
}

func expect(t *testing.T, ok bool, what string) {
	t.Helper()
	if !ok {
		t.Errorf("%s の判定が違う", what)
	}
}

func TestJudgeOneSided(t *testing.T) {
	s := build(t, spec{"09:00", "09:29", new(29), "訪看I２", nil})
	v := build(t, spec{"09:00", "09:29", new(29), "訪看I２", []string{"通常"}})
	if r := judgePair(match.Pair{Schedule: s}); r.Category != ScheduleOnly || r.Checks != nil || r.Visit != nil {
		t.Errorf("予定のみ: %+v", r)
	}
	if r := judgePair(match.Pair{Visit: v}); r.Category != VisitOnly || r.Checks != nil || r.Schedule != nil {
		t.Errorf("実績のみ: %+v", r)
	}
}

func TestAllOrder(t *testing.T) {
	s := build(t, spec{"09:00", "09:29", new(29), "訪看I２", nil})
	v := build(t, spec{"09:00", "09:29", new(29), "訪看I２", []string{"通常"}})
	bad := build(t, spec{"10:00", "10:29", new(29), "訪看I２", []string{"通常"}})
	results := All([]match.Pair{{Schedule: s, Visit: v}, {Visit: v}, {Schedule: s}, {Schedule: s, Visit: bad}})
	want := []Category{Mismatch, ScheduleOnly, VisitOnly, Match}
	for i, r := range results {
		if r.Category != want[i] {
			t.Errorf("results[%d] = %s, want %s", i, r.Category, want[i])
		}
	}
}

func TestJudgeTimeBandAdditions(t *testing.T) {
	tests := []struct {
		name      string
		start     string
		additions []string
		want      bool
	}{
		{"予定の開始が19時で加算が夜間だけなら合う", "19:00", []string{"夜間"}, true},
		{"予定の開始が10時で加算が夜間なら合わない", "10:00", []string{"夜間"}, false},
		{"予定の開始が7時で加算が早朝だけなら合う", "07:00", []string{"早朝"}, true},
		{"予定の開始が23時で加算が深夜だけなら合う", "23:00", []string{"深夜"}, true},
		{"予定の開始が5時59分で加算が深夜だけなら合う", "05:59", []string{"深夜"}, true},
		{"予定の開始が19時で加算が深夜なら合わない", "19:00", []string{"深夜"}, false},
		{"0時は深夜", "00:00", []string{"深夜"}, true},
		{"早朝の開始の境界の6時は早朝", "06:00", []string{"早朝"}, true},
		{"7時59分は早朝", "07:59", []string{"早朝"}, true},
		{"日中の12時に加算が早朝なら合わない", "12:00", []string{"早朝"}, false},
		{"17時59分は夜間でない", "17:59", []string{"夜間"}, false},
		{"21時59分は夜間", "21:59", []string{"夜間"}, true},
		{"早朝の終わりの8時は早朝でない", "08:00", []string{"早朝"}, false},
		{"夜間の開始の境界の18時は夜間", "18:00", []string{"夜間"}, true},
		{"夜間の終わりの22時は深夜", "22:00", []string{"夜間"}, false},
		{"予定の開始が夜間でも加算が通常だけなら合う", "19:00", []string{"通常"}, true},
		{"加算に緊急（イ）を含むなら合わない", "07:00", []string{"早朝", "緊急（イ）"}, false},
		{"加算が通常と緊急（イ）なら合わない", "10:00", []string{"通常", "緊急（イ）"}, false},
		{"加算が通常と夜間なら合わない", "19:00", []string{"通常", "夜間"}, false},
		{"時間帯の加算が2つ並ぶなら合わない", "22:00", []string{"夜間", "深夜"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := build(t, spec{tt.start, tt.start, new(29), "訪看I２", nil})
			v := build(t, spec{tt.start, tt.start, new(29), "訪看I２", tt.additions})
			r := judgePair(match.Pair{Schedule: s, Visit: v})
			if r.Checks.Additions.OK != tt.want {
				t.Errorf("Additions.OK = %v, want %v", r.Checks.Additions.OK, tt.want)
			}
		})
	}
}

func TestJudgeNightService(t *testing.T) {
	tests := []struct {
		name         string
		s, v         spec
		wantRangeMin int
		wantRangeMax int
		wantCategory Category
	}{
		{
			name:         "実績が訪看I２・夜で提供時間が29分なら許容範囲に入る",
			s:            spec{"19:00", "19:29", new(29), "訪看I２", nil},
			v:            spec{"19:00", "19:29", new(29), "訪看I２・夜", []string{"夜間"}},
			wantRangeMin: 20, wantRangeMax: 29,
			wantCategory: Match,
		},
		{
			name:         "予防訪看I５・２超は41〜60分の許容範囲で判定する",
			s:            spec{"10:00", "11:00", new(60), "予防訪看I５・２超", nil},
			v:            spec{"10:00", "11:00", new(60), "予防訪看I５・２超", []string{"通常"}},
			wantRangeMin: 41, wantRangeMax: 60,
			wantCategory: Match,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := judgePair(match.Pair{Schedule: build(t, tt.s), Visit: build(t, tt.v)})
			c := *r.Checks
			if r.Category != tt.wantCategory {
				t.Errorf("Category = %s, want %s（%+v）", r.Category, tt.wantCategory, c)
			}
			if !c.VisitDuration.OK || c.VisitDuration.Range == nil ||
				c.VisitDuration.Range.Min != tt.wantRangeMin || c.VisitDuration.Range.Max != tt.wantRangeMax {
				t.Errorf("VisitDuration = %+v", c.VisitDuration)
			}
		})
	}
}
