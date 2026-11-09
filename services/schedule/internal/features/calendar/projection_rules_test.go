package calendar_test

import (
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// projection は、start に始まり minutes 分の、タイトル title の確定の予定の行を返す。DB から読んだ値と同じく、日時を UTC で持つ。
func projection(title string, start time.Time, minutes int) scheduleview.Projection {
	start = start.UTC()
	end := start.Add(time.Duration(minutes) * time.Minute)
	return scheduleview.Projection{
		EventID: "event", Status: scheduleview.ProjectionConfirmed, Title: title,
		Start: scheduleview.ProjectionTime{At: &start}, End: scheduleview.ProjectionTime{At: &end},
	}
}

// TestProjectionRulesRead は、Projection の行を取り込みと同じ規則で読み替え、UTC で読んだ日時を Asia/Tokyo の日付と時刻にし、
// 訪問のタイトルのサービス内容と利用者名を、ServiceKey と ClientKey と同じ規則でそろえることを確認する。
func TestProjectionRulesRead(t *testing.T) {
	rules := calendar.ProjectionRules{}
	at := time.Date(2026, 10, 20, 9, 0, 0, 0, calendar.Tokyo)
	day := civil.Date{Year: 2026, Month: 10, Day: 20}
	tests := []struct {
		name string
		p    scheduleview.Projection
		want scheduleview.EventKind
	}{
		{"訪問の予定", projection("【訪看I2】山田　花子", at, 60), scheduleview.EventVisit},
		{"通常の予定", projection("カンファレンス", at, 60), scheduleview.EventNormal},
		{"訪問のタイトルを読めない予定", projection("【訪看I2】", at, 60), scheduleview.EventUnreadableTitle},
		{"タイトルが空白だけの予定", projection("　", at, 60), scheduleview.EventUnreadableTitle},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rules.Read(tt.p)
			if got.Kind != tt.want {
				t.Fatalf("Kind = %v, want %v", got.Kind, tt.want)
			}
			if got.Date != day || got.StartTime != (civil.Time{Hour: 9}) || got.EndTime != (civil.Time{Hour: 10}) || got.Title != tt.p.Title {
				t.Errorf("= %+v", got)
			}
			if tt.want == scheduleview.EventVisit &&
				(got.ServiceKey != rules.ServiceKey("訪看I2") || got.ClientKey != rules.ClientKey("山田 花子")) {
				t.Errorf("ServiceKey = %q, ClientKey = %q", got.ServiceKey, got.ClientKey)
			}
		})
	}
}

// TestProjectionRulesReadCalendarOnly は、終日の予定を EventAllDay に、buddy の予定に読み替えられない予定を EventUnlisted にし、
// 予定がかかる最初の日と最後の日を Date と LastDate に入れることを確認する（#672）。
func TestProjectionRulesReadCalendarOnly(t *testing.T) {
	rules := calendar.ProjectionRules{}
	d := func(day int) civil.Date { return civil.Date{Year: 2026, Month: 10, Day: day} }
	dates := func(start, end civil.Date) scheduleview.Projection {
		p := projection("休み", time.Now(), 0)
		p.Start, p.End = scheduleview.ProjectionTime{Date: &start}, scheduleview.ProjectionTime{Date: &end}
		return p
	}
	at := time.Date(2026, 10, 20, 9, 0, 0, 0, calendar.Tokyo)
	startOnly := projection("会議", at, 60)
	startOnly.End, startOnly.TimeUnreadable = scheduleview.ProjectionTime{}, true
	endOnly := projection("会議", at, 60)
	endOnly.Start, endOnly.TimeUnreadable = scheduleview.ProjectionTime{}, true
	neither := projection("会議", at, 60)
	neither.Start, neither.End, neither.TimeUnreadable = scheduleview.ProjectionTime{}, scheduleview.ProjectionTime{}, true
	tests := []struct {
		name        string
		p           scheduleview.Projection
		want        scheduleview.EventKind
		first, last civil.Date
	}{
		{"1 日の終日の予定", dates(d(20), d(21)), scheduleview.EventAllDay, d(20), d(20)},
		{"3 日の終日の予定", dates(d(20), d(23)), scheduleview.EventAllDay, d(20), d(22)},
		{"終了が開始の日の終日の予定", dates(d(20), d(20)), scheduleview.EventAllDay, d(20), d(20)},
		{"2 日にわたる予定", projection("出張", at, 48*60), scheduleview.EventUnlisted, d(20), d(22)},
		{"翌々日の 0:00 に終わる予定", projection("出張", time.Date(2026, 10, 20, 0, 0, 0, 0, calendar.Tokyo), 48*60), scheduleview.EventUnlisted, d(20), d(21)},
		{"24 時間の予定", projection("当直", at, 24*60), scheduleview.EventUnlisted, d(20), d(21)},
		{"長さが 0 の予定", projection("メモ", at, 0), scheduleview.EventUnlisted, d(20), d(20)},
		{"終了を読めない予定", startOnly, scheduleview.EventUnlisted, d(20), d(20)},
		{"開始を読めない予定", endOnly, scheduleview.EventUnlisted, d(20), d(20)},
		{"開始も終了も読めない予定", neither, scheduleview.EventUnlisted, civil.Date{}, civil.Date{}},
	}
	cancelled := projection("取り消した予定", at, 60)
	cancelled.Status = scheduleview.ProjectionCancelled
	if got := rules.Read(cancelled); got.Kind != scheduleview.EventSkipped {
		t.Errorf("取り消した予定 = %v, want EventSkipped", got.Kind)
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rules.Read(tt.p)
			if got.Kind != tt.want || got.Date != tt.first || got.LastDate != tt.last {
				t.Errorf("= %v %v〜%v, want %v %v〜%v", got.Kind, got.Date, got.LastDate, tt.want, tt.first, tt.last)
			}
		})
	}
}

// TestProjectionRulesRecurrence は、繰り返しの親の行を、取り込みと同じ規則で buddy の繰り返しの規則と除外する日に写し、
// 写せない規則でエラーを返すことを確認する。行のタイムゾーンが空でも、DB の UTC の日時を Asia/Tokyo の日時として読む。
func TestProjectionRulesRecurrence(t *testing.T) {
	rules := calendar.ProjectionRules{}
	parent := projection("定例", time.Date(2026, 10, 5, 9, 0, 0, 0, calendar.Tokyo), 60)
	parent.Recurrence = []string{"RRULE:FREQ=WEEKLY;UNTIL=20261031T000000Z", "EXDATE;TZID=Asia/Tokyo:20261012T090000"}
	rule, exclusions, err := rules.Recurrence(parent)
	if err != nil {
		t.Fatal(err)
	}
	end := civil.Date{Year: 2026, Month: 10, Day: 31}
	if rule.Frequency != schedule.Weekly || rule.EndDate == nil || *rule.EndDate != end ||
		len(exclusions) != 1 || exclusions[0] != (civil.Date{Year: 2026, Month: 10, Day: 12}) {
		t.Errorf("規則 = %+v, 除外する日 = %v", rule, exclusions)
	}
	parent.Recurrence = []string{"RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU"}
	if _, _, err := rules.Recurrence(parent); !errors.Is(err, calendar.ErrNeedsExpansion) {
		t.Errorf("月曜に始まる週の隔週で日曜を含む曜日: err = %v, want ErrNeedsExpansion", err)
	}
}
