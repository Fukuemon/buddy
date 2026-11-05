package calendar

import (
	"time"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
)

// ProjectionRules は、scheduleview.EventRules を実装する。Projection の予定を、取り込みと同じ規則（Classify と RuleFromRecurrence）で
// buddy の予定に読み替える。scheduleview は calendar を import できないので、組み立ての場所がこの値を渡す（ADR-0009）。
type ProjectionRules struct{}

var _ scheduleview.EventRules = ProjectionRules{}

// Read は、確定の予定 p を Classify で読み替える。タイトルを読めない予定は、日時を読めていれば EventUnreadableTitle にし、
// ほかの取り込まない予定は EventSkipped にする。
func (ProjectionRules) Read(p scheduleview.Projection) scheduleview.EventReading {
	c := Classify(eventOfProjection(p))
	r := scheduleview.EventReading{
		Date: c.Date, StartTime: c.StartTime, EndTime: c.EndTime, EndsNextDay: c.EndsNextDay, Title: NormalTitle(p.Title),
	}
	switch c.Kind {
	case KindVisit:
		r.Kind, r.ServiceKey, r.ClientKey = scheduleview.EventVisit, ServiceKey(c.Service), gcaltitle.NormalizeClient(c.Client)
	case KindNormal:
		r.Kind = scheduleview.EventNormal
	default:
		r.Kind = scheduleview.EventSkipped
		if c.SkipReason == SkipUnreadableTitle {
			r.Kind = scheduleview.EventUnreadableTitle
		}
	}
	return r
}

// Recurrence は、繰り返しの親の予定 p を RuleFromRecurrence で buddy の繰り返しの規則と除外する日に写す。
func (ProjectionRules) Recurrence(p scheduleview.Projection) (schedule.Rule, []civil.Date, error) {
	rec, err := RuleFromRecurrence(eventOfProjection(p))
	if err != nil {
		return schedule.Rule{}, nil, err
	}
	return rec.Rule, rec.ExclusionDates, nil
}

// ServiceKey は、サービスコードの表記を、照合の API と同じ規則（ServiceKey）でそろえる。
func (ProjectionRules) ServiceKey(code string) string { return ServiceKey(code) }

// ClientKey は、利用者の名前を、取り込みが利用者名を比べるのと同じ規則（gcaltitle.NormalizeClient）でそろえる。
func (ProjectionRules) ClientKey(name string) string { return gcaltitle.NormalizeClient(name) }

// eventOfProjection は、Projection の行を、読み替えの規則が読む Google の予定の形にする。
// 時刻のある日時は、Google が返すのと同じく Asia/Tokyo のオフセットの RFC 3339 にし、行のタイムゾーンを付ける。
func eventOfProjection(p scheduleview.Projection) Event {
	return Event{
		ID: p.EventID, Status: string(p.Status), Summary: p.Title, Recurrence: p.Recurrence, RecurringEventID: p.RecurringEventID, ETag: p.ETag,
		Start: whenOfProjection(p.Start, p.TimeZone), End: whenOfProjection(p.End, p.TimeZone),
	}
}

func whenOfProjection(t scheduleview.ProjectionTime, tz string) When {
	switch {
	case t.At != nil:
		return When{DateTime: t.At.In(Tokyo).Format(time.RFC3339), TimeZone: tz}
	case t.Date != nil:
		return When{Date: t.Date.String()}
	}
	return When{}
}
