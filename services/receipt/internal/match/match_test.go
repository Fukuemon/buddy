package match

import (
	"testing"

	"github.com/Fukuemon/buddy/services/receipt/internal/civil"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

func rec(t *testing.T, line int, client, start string) record.Record {
	t.Helper()
	d, _ := civil.NewDate(2024, 4, 1)
	s, err := civil.ParseClock(start)
	if err != nil {
		t.Fatal(err)
	}
	return record.Record{Line: line, Key: record.Key{Date: d, Client: client, Staff: "職員B"}, Start: s, End: s + 30}
}

type lines struct{ schedule, visit int }

func pairLines(pairs []Pair) map[lines]bool {
	got := map[lines]bool{}
	for _, p := range pairs {
		var l lines
		if p.Schedule != nil {
			l.schedule = p.Schedule.Line
		}
		if p.Visit != nil {
			l.visit = p.Visit.Line
		}
		got[l] = true
	}
	return got
}

func TestPairs(t *testing.T) {
	tests := []struct {
		name      string
		schedules func(t *testing.T) []record.Record
		visits    func(t *testing.T) []record.Record
		want      []lines
	}{
		{
			name:      "1 対 1",
			schedules: func(t *testing.T) []record.Record { return []record.Record{rec(t, 2, "利用者A", "09:00")} },
			visits:    func(t *testing.T) []record.Record { return []record.Record{rec(t, 2, "利用者A", "09:10")} },
			want:      []lines{{2, 2}},
		},
		{
			name:      "キーが違えば片側のみ",
			schedules: func(t *testing.T) []record.Record { return []record.Record{rec(t, 2, "利用者A", "09:00")} },
			visits:    func(t *testing.T) []record.Record { return []record.Record{rec(t, 2, "利用者C", "09:00")} },
			want:      []lines{{2, 0}, {0, 2}},
		},
		{
			name: "同じキーが 2 回ずつなら開始時間の近いもの同士",
			schedules: func(t *testing.T) []record.Record {
				return []record.Record{rec(t, 2, "利用者A", "15:00"), rec(t, 3, "利用者A", "09:00")}
			},
			visits: func(t *testing.T) []record.Record {
				return []record.Record{rec(t, 2, "利用者A", "09:05"), rec(t, 3, "利用者A", "14:50")}
			},
			want: []lines{{3, 2}, {2, 3}},
		},
		{
			name: "予定が多ければ遠い予定が残る",
			schedules: func(t *testing.T) []record.Record {
				return []record.Record{rec(t, 2, "利用者A", "09:00"), rec(t, 3, "利用者A", "13:00"), rec(t, 4, "利用者A", "17:00")}
			},
			visits: func(t *testing.T) []record.Record {
				return []record.Record{rec(t, 2, "利用者A", "12:30"), rec(t, 3, "利用者A", "16:00")}
			},
			want: []lines{{3, 2}, {4, 3}, {2, 0}},
		},
		{
			name: "貪欲に最小の差を先に取る",
			schedules: func(t *testing.T) []record.Record {
				return []record.Record{rec(t, 2, "利用者A", "09:00"), rec(t, 3, "利用者A", "10:00")}
			},
			visits: func(t *testing.T) []record.Record {
				return []record.Record{rec(t, 2, "利用者A", "09:50")}
			},
			want: []lines{{3, 2}, {2, 0}},
		},
		{
			name: "差が同じなら早い予定から",
			schedules: func(t *testing.T) []record.Record {
				return []record.Record{rec(t, 2, "利用者A", "10:00"), rec(t, 3, "利用者A", "09:00")}
			},
			visits: func(t *testing.T) []record.Record {
				return []record.Record{rec(t, 2, "利用者A", "09:30")}
			},
			want: []lines{{3, 2}, {2, 0}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Pairs(tt.schedules(t), tt.visits(t))
			if len(got) != len(tt.want) {
				t.Fatalf("pairs = %d, want %d", len(got), len(tt.want))
			}
			set := pairLines(got)
			for _, w := range tt.want {
				if !set[w] {
					t.Errorf("対 %+v がない: %+v", w, set)
				}
			}
		})
	}
}
