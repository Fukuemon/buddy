package calendar

import (
	"strings"
	"time"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"
	"github.com/Fukuemon/buddy/packages/go/servicecode"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// Kind は、予定を何として取り込むかである。
type Kind int

// Kind の値。
const (
	// KindSkipped の予定は取り込まない。理由は Candidate.SkipReason にある。
	KindSkipped Kind = iota
	// KindVisit の予定は、訪問の予定として取り込む。
	KindVisit
	// KindNormal の予定は、外部の予定のタイトルを、buddy の予定のタイトルにした通常の予定として取り込む。
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
	// SkipMultiDay は、Asia/Tokyo で、終了が開始の翌日より後の予定と、終了が翌日で長さが 24 時間以上の予定である。
	// 終了が翌日で 24 時間未満の予定は、終了が翌日の予定に読み替えるので当たらない（ADR-0011）。
	SkipMultiDay SkipReason = "multi_day"
	// SkipUnreadableTime は、開始か終了の日時が無いか、RFC 3339 で読めない予定である。
	SkipUnreadableTime SkipReason = "unreadable_time"
	// SkipUnreadableTitle は、タイトルが空白だけの予定と、タイトルに `【` と `】` を含むがサービス内容か利用者名を読めない予定である。
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
	// EndsNextDay は、Date の翌日の EndTime に終わる予定のときに true である。翌日の 0:00 に終わる予定も、EndTime を 0:00 にして true にする。
	EndsNextDay bool
	// Title は、KindNormal の予定のタイトルである。
	Title string
	// Service と Client は、KindVisit の予定のタイトルから読んだサービス内容と利用者名で、表記をそろえていない。
	Service string
	Client  string
	// SkipReason は、KindSkipped の予定の理由である。
	SkipReason SkipReason
}

// maxTitleRunes は、通常の予定のタイトルの長さの上限である。予定の API のタイトルの上限と同じにする。
const maxTitleRunes = 255

// NormalTitle は、外部の予定のタイトルを通常の予定のタイトルにする。上限を超える分は切る。
func NormalTitle(summary string) string {
	if r := []rune(summary); len(r) > maxTitleRunes {
		return string(r[:maxTitleRunes])
	}
	return summary
}

// Classify は、ev を、訪問の予定、通常の予定、取り込まない予定のどれかに分ける。
// タイトルに `【` と `】` の両方を含む予定を訪問の予定とし、照合の API と同じ規則（gcaltitle）で読む。
// Asia/Tokyo で終了が開始の翌日で、長さが 24 時間未満の予定は、終了が翌日の予定（EndsNextDay）に読み替える（ADR-0011）。
// 取り消した予定、終日の予定、それ以外の日をまたぐ予定、開始か終了の日時を読めない予定、分に丸めて長さが 0 以下の予定、
// タイトルが空白だけの予定、訪問のタイトルを読めない予定は取り込まない。通常の予定のタイトルは 255 文字までに切る。
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
	start, err := ev.Start.Instant()
	if err != nil {
		return skipped(SkipUnreadableTime)
	}
	end, err := ev.End.Instant()
	if err != nil {
		return skipped(SkipUnreadableTime)
	}
	start, end = start.In(Tokyo), end.In(Tokyo)
	c := Candidate{
		Date:      civil.DateOf(start),
		StartTime: clockOf(start),
		EndTime:   clockOf(end),
	}
	if civil.DateOf(end) != c.Date {
		if !isEndingNextDay(start, end) {
			c.Kind, c.SkipReason = KindSkipped, SkipMultiDay
			return c
		}
		c.EndsNextDay = true
	}
	if !c.EndsNextDay && !c.StartTime.Before(c.EndTime) {
		c.Kind, c.SkipReason = KindSkipped, SkipZeroLength
		return c
	}
	if strings.TrimSpace(ev.Summary) == "" {
		c.Kind, c.SkipReason = KindSkipped, SkipUnreadableTitle
		return c
	}
	if !gcaltitle.IsVisitTitle(ev.Summary) {
		c.Kind, c.Title = KindNormal, NormalTitle(ev.Summary)
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

// isEndingNextDay は、Asia/Tokyo の日時 start と end で、end が start の翌日で、長さが 24 時間未満かを返す。
// 分に丸めると終了の時刻が開始の時刻より前にならない予定（24 時間に秒だけ足りない予定）は、24 時間とみなして false を返す。
func isEndingNextDay(start, end time.Time) bool {
	return civil.DateOf(end) == civil.DateOf(start.AddDate(0, 0, 1)) &&
		end.Sub(start) < 24*time.Hour && clockOf(end).Before(clockOf(start))
}

func clockOf(t time.Time) civil.Time {
	return civil.Time{Hour: t.Hour(), Minute: t.Minute()}
}

// ServiceKey は、サービス内容 s を、照合の API と同じ規則で表記をそろえた値にする。
// 2 つのサービス内容（タイトルのサービス内容とマスタのコード）は、ServiceKey の値が同じときに同じとみなす。
func ServiceKey(s string) string {
	return servicecode.Canonical(servicecode.Normalize(strings.TrimSpace(s)))
}
