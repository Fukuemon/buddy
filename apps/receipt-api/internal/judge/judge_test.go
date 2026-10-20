package judge

import (
	"testing"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/match"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
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
	normal := []string{RequiredAddition}
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
			r := Judge(match.Pair{Schedule: build(t, tt.s), Visit: build(t, tt.v)})
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
	if r := Judge(match.Pair{Schedule: s}); r.Category != ScheduleOnly || r.Checks != nil || r.Visit != nil {
		t.Errorf("予定のみ: %+v", r)
	}
	if r := Judge(match.Pair{Visit: v}); r.Category != VisitOnly || r.Checks != nil || r.Schedule != nil {
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
