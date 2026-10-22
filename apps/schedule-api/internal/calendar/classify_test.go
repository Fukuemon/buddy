package calendar_test

import (
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
	"github.com/Fukuemon/buddy/apps/schedule-api/internal/civil"
)

func date(t *testing.T, s string) civil.Date {
	t.Helper()
	d, err := civil.ParseDate(s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func clock(h, m int) civil.Time { return civil.Time{Hour: h, Minute: m} }

func timed(start, end string) (calendar.When, calendar.When) {
	return calendar.When{DateTime: start}, calendar.When{DateTime: end}
}

func TestClassify(t *testing.T) {
	visit := func(t *testing.T, d string, sh, sm, eh, em int, service, client string) calendar.Candidate {
		return calendar.Candidate{
			Kind: calendar.KindVisit, Date: date(t, d), StartTime: clock(sh, sm), EndTime: clock(eh, em),
			Service: service, Client: client,
		}
	}
	tests := []struct {
		name  string
		event func() calendar.Event
		want  func(t *testing.T) calendar.Candidate
	}{
		{
			name: "訪問",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T10:00:00+09:00", "2026-10-20T11:00:00+09:00")
				return calendar.Event{Status: "confirmed", Start: s, End: e, Summary: "【訪看I2】利用者A"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return visit(t, "2026-10-20", 10, 0, 11, 0, "訪看I2", "利用者A")
			},
		},
		{
			name: "タイトルが空白だけの予定は取り込まない",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T10:00:00+09:00", "2026-10-20T11:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: " 　"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindSkipped, Date: date(t, "2026-10-20"), StartTime: clock(10, 0), EndTime: clock(11, 0),
					SkipReason: calendar.SkipUnreadableTitle,
				}
			},
		},
		{
			name: "通常の予定のタイトルは 255 文字までに切る",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T10:00:00+09:00", "2026-10-20T11:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: strings.Repeat("会", 300)}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindNormal, Date: date(t, "2026-10-20"), StartTime: clock(10, 0), EndTime: clock(11, 0),
					Title: strings.Repeat("会", 255),
				}
			},
		},
		{
			name: "】の後の全角の空白を飛ばす",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T10:00:00+09:00", "2026-10-20T11:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: "【訪看Ｉ２】　利用者 A"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return visit(t, "2026-10-20", 10, 0, 11, 0, "訪看Ｉ２", "利用者 A")
			},
		},
		{
			name: "UTC の日時を Asia/Tokyo に直す",
			event: func() calendar.Event {
				s, e := timed("2026-10-19T15:30:00Z", "2026-10-19T16:00:00Z")
				return calendar.Event{Start: s, End: e, Summary: "【訪看I2】利用者A"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return visit(t, "2026-10-20", 0, 30, 1, 0, "訪看I2", "利用者A")
			},
		},
		{
			name: "【】が無いタイトルは通常の予定",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T13:00:00+09:00", "2026-10-20T14:30:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: "会議"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindNormal, Date: date(t, "2026-10-20"),
					StartTime: clock(13, 0), EndTime: clock(14, 30), Title: "会議",
				}
			},
		},
		{
			name: "【だけのタイトルは通常の予定",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T13:00:00+09:00", "2026-10-20T14:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: "【訪看I2 利用者A"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindNormal, Date: date(t, "2026-10-20"),
					StartTime: clock(13, 0), EndTime: clock(14, 0), Title: "【訪看I2 利用者A",
				}
			},
		},
		{
			name: "サービス内容が空の訪問のタイトルは取り込まない",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T10:00:00+09:00", "2026-10-20T11:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: "【】利用者A"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindSkipped, Date: date(t, "2026-10-20"),
					StartTime: clock(10, 0), EndTime: clock(11, 0), SkipReason: calendar.SkipUnreadableTitle,
				}
			},
		},
		{
			name: "取り消した予定",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T10:00:00+09:00", "2026-10-20T11:00:00+09:00")
				return calendar.Event{Status: calendar.StatusCancelled, Start: s, End: e, Summary: "【訪看I2】利用者A"}
			},
			want: func(*testing.T) calendar.Candidate {
				return calendar.Candidate{Kind: calendar.KindSkipped, SkipReason: calendar.SkipCancelled}
			},
		},
		{
			name: "終日の予定",
			event: func() calendar.Event {
				return calendar.Event{
					Start: calendar.When{Date: "2026-10-20"}, End: calendar.When{Date: "2026-10-21"}, Summary: "研修",
				}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{Kind: calendar.KindSkipped, Date: date(t, "2026-10-20"), SkipReason: calendar.SkipAllDay}
			},
		},
		{
			name: "日をまたぐ予定",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T23:00:00+09:00", "2026-10-21T01:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: "【訪看I2】利用者A"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindSkipped, Date: date(t, "2026-10-20"),
					StartTime: clock(23, 0), EndTime: clock(1, 0), SkipReason: calendar.SkipMultiDay,
				}
			},
		},
		{
			name: "24 時に終わる予定は日をまたぐ",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T23:00:00+09:00", "2026-10-21T00:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: "会議"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindSkipped, Date: date(t, "2026-10-20"),
					StartTime: clock(23, 0), EndTime: clock(0, 0), SkipReason: calendar.SkipMultiDay,
				}
			},
		},
		{
			name: "UTC では同じ日でも Asia/Tokyo で日をまたぐ予定",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T14:30:00Z", "2026-10-20T15:30:00Z")
				return calendar.Event{Start: s, End: e, Summary: "会議"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindSkipped, Date: date(t, "2026-10-20"),
					StartTime: clock(23, 30), EndTime: clock(0, 30), SkipReason: calendar.SkipMultiDay,
				}
			},
		},
		{
			name: "開始と終了が同じ予定",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T10:00:00+09:00", "2026-10-20T10:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: "【訪看I2】利用者A"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindSkipped, Date: date(t, "2026-10-20"),
					StartTime: clock(10, 0), EndTime: clock(10, 0), SkipReason: calendar.SkipZeroLength,
				}
			},
		},
		{
			name: "秒を落とすと開始と終了が同じになる予定",
			event: func() calendar.Event {
				s, e := timed("2026-10-20T10:00:10+09:00", "2026-10-20T10:00:50+09:00")
				return calendar.Event{Start: s, End: e, Summary: "会議"}
			},
			want: func(t *testing.T) calendar.Candidate {
				return calendar.Candidate{
					Kind: calendar.KindSkipped, Date: date(t, "2026-10-20"),
					StartTime: clock(10, 0), EndTime: clock(10, 0), SkipReason: calendar.SkipZeroLength,
				}
			},
		},
		{
			name: "開始の日時を読めない",
			event: func() calendar.Event {
				s, e := timed("2026-10-20 10:00", "2026-10-20T11:00:00+09:00")
				return calendar.Event{Start: s, End: e, Summary: "会議"}
			},
			want: func(*testing.T) calendar.Candidate {
				return calendar.Candidate{Kind: calendar.KindSkipped, SkipReason: calendar.SkipUnreadableTime}
			},
		},
		{
			name: "終了の日時が無い",
			event: func() calendar.Event {
				return calendar.Event{Start: calendar.When{DateTime: "2026-10-20T10:00:00+09:00"}, Summary: "会議"}
			},
			want: func(*testing.T) calendar.Candidate {
				return calendar.Candidate{Kind: calendar.KindSkipped, SkipReason: calendar.SkipUnreadableTime}
			},
		},
		{
			name:  "開始が無い",
			event: func() calendar.Event { return calendar.Event{Summary: "会議"} },
			want: func(*testing.T) calendar.Candidate {
				return calendar.Candidate{Kind: calendar.KindSkipped, SkipReason: calendar.SkipUnreadableTime}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got, want := calendar.Classify(tt.event()), tt.want(t); got != want {
				t.Errorf("Classify =\n%+v\nwant\n%+v", got, want)
			}
		})
	}
}
