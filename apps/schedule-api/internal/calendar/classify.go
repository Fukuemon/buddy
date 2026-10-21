package calendar

import (
	"time"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
)

// Kind は、予定を何として取り込むかである。
type Kind int

// Kind の値。
const (
	// KindSkipped の予定は取り込まない。理由は Candidate.SkipReason にある。
	KindSkipped Kind = iota
	// KindVisit の予定は、訪問の予定として取り込む。
	KindVisit
	// KindNormal の予定は、題名をタイトルにした通常の予定として取り込む。
	KindNormal
)

// SkipReason は、予定を取り込まない理由である。
type SkipReason string

// SkipReason の値。
const (
	// SkipCancelled は、取り消した予定である。繰り返しの予定の取り消した回を含む。
	SkipCancelled SkipReason = "cancelled"
	// SkipAllDay は、時刻の無い終日の予定である。
	SkipAllDay SkipReason = "all_day"
	// SkipMultiDay は、Asia/Tokyo で開始と終了の日付が違う予定である。24:00 に終わる予定は翌日の 0:00 に終わるので、これに当たる。
	SkipMultiDay SkipReason = "multi_day"
	// SkipUnreadableTime は、開始か終了の日時が無いか、RFC 3339 で読めない予定である。
	SkipUnreadableTime SkipReason = "unreadable_time"
	// SkipUnreadableTitle は、題名に `【` と `】` を含むが、サービス内容か利用者名を読めない予定である。
	SkipUnreadableTitle SkipReason = "unreadable_title"
	// SkipZeroLength は、分に丸めると終了が開始より後でない予定である。
	SkipZeroLength SkipReason = "zero_length"
)

// Candidate は、1 つの予定を buddy の予定に読み替えた候補である。
type Candidate struct {
	Kind Kind
	// Date、StartTime、EndTime は、Asia/Tokyo での日付と時刻である。
	// 取り込まない予定では、読めた分だけを持つ（終日の予定は Date だけ、日をまたぐ予定は開始の日付と、両方の時刻）。
	Date      civil.Date
	StartTime civil.Time
	EndTime   civil.Time
	// Title は、KindNormal の予定のタイトルである。
	Title string
	// Service と Client は、KindVisit の予定の題名から読んだサービス内容と利用者名で、表記をそろえていない。
	Service string
	Client  string
	// SkipReason は、KindSkipped の予定の理由である。
	SkipReason SkipReason
}

// Classify は、ev を、訪問の予定、通常の予定、取り込まない予定のどれかに分ける。
// 題名に `【` と `】` の両方を含む予定を訪問の予定とし、照合の API と同じ規則（gcaltitle）で読む。
// 取り消した予定、終日の予定、日をまたぐ予定、開始か終了の日時を読めない予定、分に丸めて長さが 0 以下の予定、
// 訪問の題名を読めない予定は取り込まない。
func Classify(ev Event) Candidate {
	if ev.Status == StatusCancelled {
		return skipped(SkipCancelled)
	}
	if ev.Start.DateTime == "" && ev.Start.Date != "" {
		c := skipped(SkipAllDay)
		if d, err := time.Parse(time.DateOnly, ev.Start.Date); err == nil {
			c.Date = civil.DateOf(d)
		}
		return c
	}
	start, err := time.Parse(time.RFC3339, ev.Start.DateTime)
	if err != nil {
		return skipped(SkipUnreadableTime)
	}
	end, err := time.Parse(time.RFC3339, ev.End.DateTime)
	if err != nil {
		return skipped(SkipUnreadableTime)
	}
	start, end = start.In(tokyo), end.In(tokyo)
	c := Candidate{
		Date:      civil.DateOf(start),
		StartTime: clockOf(start),
		EndTime:   clockOf(end),
	}
	if civil.DateOf(end) != c.Date {
		c.Kind, c.SkipReason = KindSkipped, SkipMultiDay
		return c
	}
	if !c.StartTime.Before(c.EndTime) {
		c.Kind, c.SkipReason = KindSkipped, SkipZeroLength
		return c
	}
	if !gcaltitle.IsVisitTitle(ev.Summary) {
		c.Kind, c.Title = KindNormal, ev.Summary
		return c
	}
	service, client, err := gcaltitle.ParseTitle(ev.Summary)
	if err != nil {
		c.Kind, c.SkipReason = KindSkipped, SkipUnreadableTitle
		return c
	}
	c.Kind, c.Service, c.Client = KindVisit, service, client
	return c
}

func skipped(reason SkipReason) Candidate {
	return Candidate{Kind: KindSkipped, SkipReason: reason}
}

func clockOf(t time.Time) civil.Time {
	return civil.Time{Hour: t.Hour(), Minute: t.Minute()}
}
