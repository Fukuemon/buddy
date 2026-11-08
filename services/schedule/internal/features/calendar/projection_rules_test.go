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
	allDay := projection("休み", at, 0)
	next := civil.Date{Year: 2026, Month: 10, Day: 21}
	allDay.Start, allDay.End = scheduleview.ProjectionTime{Date: &day}, scheduleview.ProjectionTime{Date: &next}
	tests := []struct {
		name string
		p    scheduleview.Projection
		want scheduleview.EventKind
	}{
		{"訪問の予定", projection("【訪看I2】山田　花子", at, 60), scheduleview.EventVisit},
		{"通常の予定", projection("カンファレンス", at, 60), scheduleview.EventNormal},
		{"訪問のタイトルを読めない予定", projection("【訪看I2】", at, 60), scheduleview.EventUnreadableTitle},
		{"タイトルが空白だけの予定", projection("　", at, 60), scheduleview.EventUnreadableTitle},
		{"終日の予定", allDay, scheduleview.EventSkipped},
		{"日をまたぐ予定", projection("出張", at, 48*60), scheduleview.EventSkipped},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rules.Read(tt.p)
			if got.Kind != tt.want {
				t.Fatalf("Kind = %v, want %v", got.Kind, tt.want)
			}
			if tt.want == scheduleview.EventSkipped {
				return
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
