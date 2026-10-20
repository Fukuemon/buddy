package report_test

import (
	"bytes"
	"encoding/csv"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/judge"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/match"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
	"github.com/Fukuemon/buddy/apps/receipt-api/tools/parity/report"
)

func rec(t *testing.T, client, start, end string, duration *int, service string, additions []string) *record.Record {
	t.Helper()
	d, _ := civil.NewDate(2024, 4, 1)
	s, err := civil.ParseClock(start)
	if err != nil {
		t.Fatal(err)
	}
	e, err := civil.ParseClock(end)
	if err != nil {
		t.Fatal(err)
	}
	return &record.Record{
		Key:   record.Key{Date: d, Client: client, Staff: "職員B"},
		Start: s, End: e, Duration: duration, Service: service, Additions: additions,
	}
}

func TestWrite(t *testing.T) {
	normal := []string{"通常"}
	pairs := []match.Pair{
		{
			Schedule: rec(t, "利用者C", "10:00", "10:29", new(29), "訪看I２", nil),
			Visit:    rec(t, "利用者C", "10:05", "10:40", new(35), "訪看I２", []string{"緊急"}),
		},
		{Schedule: rec(t, "利用者F", "09:00", "09:29", new(29), "訪看I２", nil)},
		{Visit: rec(t, "利用者G", "09:00", "09:29", nil, "訪看I２", normal)},
		{
			Schedule: rec(t, "利用者D", "13:00", "14:00", new(60), "医", nil),
			Visit:    rec(t, "利用者D", "13:00", "13:50", new(50), "基本療養費(I)", normal),
		},
	}
	var buf bytes.Buffer
	if err := report.Write(&buf, judge.All(pairs)); err != nil {
		t.Fatal(err)
	}
	b, ok := bytes.CutPrefix(buf.Bytes(), []byte("\xEF\xBB\xBF"))
	if !ok {
		t.Fatal("BOM がない")
	}
	got, err := csv.NewReader(bytes.NewReader(b)).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	sep := func(label string) string { return label + strings.Repeat(",---", 11) }
	want := []string{
		strings.Join(report.Header(), ","),
		sep("不整合データ"),
		"2024-04-01,利用者C,職員B,訪看I２,10:00 ❌,10:29,29 ❌,訪看I２,10:05 ❌,10:40 ❌ (20~29),35 ❌ ❌ (20~29),緊急 ※",
		sep("予定のみ"),
		"2024-04-01,利用者F,職員B,訪看I２,09:00,09:29,29,データなし,データなし,データなし,データなし,データなし",
		sep("実績のみ"),
		"2024-04-01,利用者G,職員B,データなし,データなし,データなし,データなし,訪看I２,09:00,09:29,データなし,通常",
		sep("整合データ"),
		"2024-04-01,利用者D,職員B,医,13:00,14:00 ※,60 ※ (30~90),基本療養費(I),13:00,13:50 ※,50 ※ (30~90),通常",
	}
	if len(got) != len(want) {
		t.Fatalf("rows = %d, want %d\n%s", len(got), len(want), b)
	}
	for i := range want {
		if g := strings.Join(got[i], ","); g != want[i] {
			t.Errorf("row %d\n got %s\nwant %s", i, g, want[i])
		}
	}
}
