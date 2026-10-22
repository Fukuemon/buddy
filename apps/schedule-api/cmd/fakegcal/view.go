package main

import (
	"html/template"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/gcal/gcaltest"
)

// viewPage は、偽物のカレンダーの予定を並べる画面である。手元の確かめと証跡の動画で、buddy から書いた予定を見るために使う。
var viewPage = template.Must(template.New("view").Parse(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{{if .Refresh}}<meta http-equiv="refresh" content="{{.Refresh}}">{{end}}
<title>偽物の Google カレンダー</title>
<style>
body { font-family: system-ui, sans-serif; margin: 16px; color: #1a1a1a; background: #fff; }
h1 { font-size: 20px; }
nav a { margin-right: 12px; }
nav a[aria-current] { font-weight: bold; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; }
th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
.cancelled { color: #888; text-decoration: line-through; }
.note { color: #555; font-size: 13px; }
</style>
</head>
<body>
<h1>偽物の Google カレンダー</h1>
<p class="note">手元の compose で Google Calendar API の代わりに動く偽物の画面である。「Google で 1 時間遅らせる」と「Google で消す」は、職員が Google カレンダーで予定を直すか消したときと同じく etag を変える。</p>
<form method="post" action="/view/hold"><input type="hidden" name="calendar" value="{{.Calendar}}"><input type="hidden" name="hold" value="{{if .Hold}}false{{else}}true{{end}}"><button data-testid="fake-gcal-hold">{{if .Hold}}変更を buddy に渡す{{else}}変更を buddy に渡さない{{end}}</button></form>
<nav>{{range .Calendars}}<a href="?calendar={{.}}"{{if eq . $.Calendar}} aria-current="page"{{end}} data-testid="fake-gcal-calendar-{{.}}">{{.}}</a>{{end}}</nav>
<table data-testid="fake-gcal-events">
<thead><tr><th>開始</th><th>終了</th><th>題名</th><th>繰り返し</th><th></th></tr></thead>
<tbody>
{{range .Events}}<tr data-testid="fake-gcal-event-{{.ID}}"{{if .Cancelled}} class="cancelled"{{end}}>
<td>{{.Start}}</td><td>{{.End}}</td><td data-testid="fake-gcal-summary-{{.ID}}">{{.Summary}}</td><td>{{.Recurrence}}</td>
<td>{{if not .Cancelled}}<form method="post" action="/view/shift"><input type="hidden" name="calendar" value="{{$.Calendar}}"><input type="hidden" name="event" value="{{.ID}}"><button data-testid="fake-gcal-shift-{{.ID}}">Google で 1 時間遅らせる</button></form>
<form method="post" action="/view/delete"><input type="hidden" name="calendar" value="{{$.Calendar}}"><input type="hidden" name="event" value="{{.ID}}"><button data-testid="fake-gcal-delete-{{.ID}}">Google で消す</button></form>{{end}}</td>
</tr>
{{else}}<tr><td colspan="5">予定はありません</td></tr>
{{end}}</tbody>
</table>
</body>
</html>
`))

type viewEvent struct {
	ID, Start, End, Summary, Recurrence string
	Cancelled                           bool
}

// localLayout は、タイムゾーンを別に持つ予定の日時（オフセットの無い形）である。
const localLayout = "2006-01-02T15:04:05"

func parseDateTime(s string) (time.Time, string, bool) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, time.RFC3339, true
	}
	if t, err := time.Parse(localLayout, s); err == nil {
		return t, localLayout, true
	}
	return time.Time{}, "", false
}

func display(t *calendar.EventDateTime) string {
	if t == nil {
		return ""
	}
	if t.Date != "" {
		return t.Date + "（終日）"
	}
	if v, _, ok := parseDateTime(t.DateTime); ok {
		return v.Format("2006-01-02 15:04")
	}
	return t.DateTime
}

func viewHandler(s *gcaltest.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ids := s.CalendarIDs()
		slices.Sort(ids)
		cal := r.URL.Query().Get("calendar")
		if cal == "" && len(ids) > 0 {
			cal = ids[0]
		}
		evs := s.Events(cal)
		slices.SortFunc(evs, func(a, b calendar.Event) int { return strings.Compare(sortKey(a), sortKey(b)) })
		rows := make([]viewEvent, 0, len(evs))
		for _, ev := range evs {
			// 繰り返しの取り消した回は、開始の日時を持たない
			if ev.Start == nil {
				continue
			}
			rows = append(rows, viewEvent{
				ID: ev.Id, Start: display(ev.Start), End: display(ev.End), Summary: ev.Summary,
				Recurrence: strings.Join(ev.Recurrence, " "), Cancelled: ev.Status == "cancelled",
			})
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = viewPage.Execute(w, map[string]any{
			"Calendars": ids, "Calendar": cal, "Events": rows, "Refresh": r.URL.Query().Get("refresh"), "Hold": s.Holding(),
		})
	}
}

func sortKey(ev calendar.Event) string {
	if ev.Start == nil {
		return ""
	}
	if t, _, ok := parseDateTime(ev.Start.DateTime); ok {
		return t.Format(localLayout)
	}
	return ev.Start.Date
}

// shiftHandler は、予定を 1 時間遅らせ、etag を変える。職員が Google カレンダーで予定を直したときの代わりである。
func shiftHandler(s *gcaltest.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cal, id := r.FormValue("calendar"), r.FormValue("event")
		ok := s.Edit(cal, id, func(ev *calendar.Event) {
			for _, t := range []*calendar.EventDateTime{ev.Start, ev.End} {
				if t == nil {
					continue
				}
				if v, layout, ok := parseDateTime(t.DateTime); ok {
					t.DateTime = v.Add(time.Hour).Format(layout)
				}
			}
		})
		if !ok {
			http.NotFound(w, r)
			return
		}
		http.Redirect(w, r, "/view?"+url.Values{"calendar": {cal}}.Encode(), http.StatusSeeOther)
	}
}

// deleteHandler は、予定を消す。職員が Google カレンダーで予定を消したときの代わりである。
func deleteHandler(s *gcaltest.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cal := r.FormValue("calendar")
		if !s.Delete(cal, r.FormValue("event")) {
			http.NotFound(w, r)
			return
		}
		http.Redirect(w, r, "/view?"+url.Values{"calendar": {cal}}.Encode(), http.StatusSeeOther)
	}
}

// holdHandler は、Google の変更を増分の取得で返すかを変える。予定の API が Google の変更を読む前に、buddy の変更を書き出させる試験に使う。
func holdHandler(s *gcaltest.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.SetHoldChanges(r.FormValue("hold") == "true")
		http.Redirect(w, r, "/view?"+url.Values{"calendar": {r.FormValue("calendar")}}.Encode(), http.StatusSeeOther)
	}
}
