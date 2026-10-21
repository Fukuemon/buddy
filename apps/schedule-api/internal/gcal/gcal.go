// Package gcal は、Google Calendar API で予定を読み、calendar.EventSource を実装する。
package gcal

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"
	"google.golang.org/api/googleapi"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
)

// Reader は、Google Calendar API で予定を読む calendar.EventSource である。
type Reader struct {
	svc *calendarv3.Service
}

// NewReader は、svc で予定を読む Reader を返す。
// svc の認証は呼び出す側が決める。予定を読むには calendar.readonly のスコープが要る。
func NewReader(svc *calendarv3.Service) *Reader {
	return &Reader{svc: svc}
}

// Events は、calendarID のカレンダーの、timeMin から timeMax までに重なる予定を、全てのページを読んで返す。
// 繰り返しの予定は展開せず（singleEvents=false）、親の予定と、変えた回と取り消した回を返す。日時は Asia/Tokyo で返る。
// Calendar API が 403 か 404 を返すと calendar.ErrUnreadable を、ほかの失敗では calendar.ErrUnavailable を包んだエラーを返す。
// HTTP の誤りの応答では、*googleapi.Error も包む。エラーの文はカレンダー ID（職員のメールアドレスのことがある）を含まない。
func (r *Reader) Events(ctx context.Context, calendarID string, timeMin, timeMax time.Time) ([]calendar.Event, error) {
	var events []calendar.Event
	// singleEvents と showDeleted が false のとき、繰り返しの予定の取り消した回は cancelled で返る。
	// 出典: https://developers.google.com/workspace/calendar/api/v3/reference/events/list
	err := r.svc.Events.List(calendarID).
		TimeMin(timeMin.Format(time.RFC3339)).
		TimeMax(timeMax.Format(time.RFC3339)).
		TimeZone(calendar.TimeZone).
		SingleEvents(false).
		ShowDeleted(false).
		MaxResults(2500).
		Pages(ctx, func(page *calendarv3.Events) error {
			if err := checkAccess(page); err != nil {
				return err
			}
			for _, ev := range page.Items {
				events = append(events, toEvent(ev))
			}
			return nil
		})
	if err != nil {
		return nil, wrap("カレンダーの予定を取れない", err)
	}
	return events, nil
}

// Instances は、繰り返しの親の予定 eventID の、timeMin から timeMax までに重なる回を、全てのページを読んで返す。
// 取り消した回は返さない（showDeleted=false）。エラーは Events と同じである。
// 出典: https://developers.google.com/workspace/calendar/api/v3/reference/events/instances
func (r *Reader) Instances(ctx context.Context, calendarID, eventID string, timeMin, timeMax time.Time) ([]calendar.Event, error) {
	var events []calendar.Event
	err := r.svc.Events.Instances(calendarID, eventID).
		TimeMin(timeMin.Format(time.RFC3339)).
		TimeMax(timeMax.Format(time.RFC3339)).
		TimeZone(calendar.TimeZone).
		ShowDeleted(false).
		MaxResults(2500).
		Pages(ctx, func(page *calendarv3.Events) error {
			for _, ev := range page.Items {
				events = append(events, toEvent(ev))
			}
			return nil
		})
	if err != nil {
		return nil, wrap("繰り返しの予定の回を取れない", err)
	}
	return events, nil
}

// Check は、calendarID のカレンダーの予定を 1 件だけ読み、読めるかを確かめる。エラーは Events と同じである。
func (r *Reader) Check(ctx context.Context, calendarID string) error {
	page, err := r.svc.Events.List(calendarID).MaxResults(1).Context(ctx).Do()
	if err != nil {
		return wrap("カレンダーを読めない", err)
	}
	return checkAccess(page)
}

// Changes は、calendarID のカレンダーの、syncToken を受け取った後に変わった予定を、全てのページを読んで返す。
// syncToken が空なら、消した予定を含む全ての予定を読む。繰り返しの予定は展開しない。日時は Asia/Tokyo で返る。
// トークンが切れていれば（410）calendar.ErrSyncTokenExpired を包んだエラーを返す。ほかのエラーは Events と同じである。
// 出典: https://developers.google.com/workspace/calendar/api/guides/sync
func (r *Reader) Changes(ctx context.Context, calendarID, syncToken string) (calendar.Changes, error) {
	var out calendar.Changes
	// syncToken と一緒に、期間（timeMin、timeMax）は渡せない。
	call := r.svc.Events.List(calendarID).
		TimeZone(calendar.TimeZone).
		SingleEvents(false).
		ShowDeleted(true).
		MaxResults(2500)
	if syncToken != "" {
		call.SyncToken(syncToken)
	}
	err := call.Pages(ctx, func(page *calendarv3.Events) error {
		if err := checkAccess(page); err != nil {
			return err
		}
		for _, ev := range page.Items {
			out.Events = append(out.Events, toEvent(ev))
		}
		if page.NextSyncToken != "" {
			out.NextSyncToken = page.NextSyncToken
		}
		return nil
	})
	var gerr *googleapi.Error
	if errors.As(err, &gerr) && gerr.Code == http.StatusGone {
		return calendar.Changes{}, fmt.Errorf("変わった予定を取れない: %w", calendar.ErrSyncTokenExpired)
	}
	if err != nil {
		return calendar.Changes{}, wrap("変わった予定を取れない", err)
	}
	return out, nil
}

// Event は、calendarID のカレンダーの予定 eventID を返す。消した予定は、Status が cancelled で返る。エラーは Events と同じである。
// 出典: https://developers.google.com/workspace/calendar/api/v3/reference/events/get
func (r *Reader) Event(ctx context.Context, calendarID, eventID string) (calendar.Event, error) {
	ev, err := r.svc.Events.Get(calendarID, eventID).TimeZone(calendar.TimeZone).Context(ctx).Do()
	if err != nil {
		return calendar.Event{}, wrap("予定を取れない", err)
	}
	return toEvent(ev), nil
}

// errFreeBusy は、カレンダーが空き時間だけの共有であることを表す。
var errFreeBusy = fmt.Errorf("%w: 空き時間だけの共有である", calendar.ErrUnreadable)

// checkAccess は、カレンダーが空き時間だけの共有（freeBusyReader）なら calendar.ErrUnreadable を包んだエラーを返す。
// 空き時間だけの共有では、events.list が繰り返しの親と予定の題名を返さないためである。
// 出典: https://developers.google.com/workspace/calendar/api/guides/recurringevents
func checkAccess(page *calendarv3.Events) error {
	if page.AccessRole == "freeBusyReader" {
		return errFreeBusy
	}
	return nil
}

// wrap は、Calendar API の呼び出しの誤りを、calendar.ErrUnreadable か calendar.ErrUnavailable で包む。
func wrap(msg string, err error) error {
	// 通信の誤り（*url.Error）の文は、カレンダー ID を含む要求の URL を持つ。
	var uerr *url.Error
	if errors.As(err, &uerr) {
		err = uerr.Err
	}
	if errors.Is(err, calendar.ErrUnreadable) {
		return fmt.Errorf("%s: %w", msg, err)
	}
	kind := calendar.ErrUnavailable
	var gerr *googleapi.Error
	if errors.As(err, &gerr) && (gerr.Code == http.StatusForbidden || gerr.Code == http.StatusNotFound) {
		kind = calendar.ErrUnreadable
	}
	return fmt.Errorf("%s: %w: %w", msg, kind, err)
}

func toEvent(ev *calendarv3.Event) calendar.Event {
	return calendar.Event{
		ID:               ev.Id,
		ICalUID:          ev.ICalUID,
		Status:           ev.Status,
		Start:            toWhen(ev.Start),
		End:              toWhen(ev.End),
		Summary:          ev.Summary,
		Recurrence:       ev.Recurrence,
		RecurringEventID: ev.RecurringEventId,
		OriginalStart:    toWhen(ev.OriginalStartTime),
		ETag:             ev.Etag,
	}
}

func toWhen(t *calendarv3.EventDateTime) calendar.When {
	if t == nil {
		return calendar.When{}
	}
	return calendar.When{Date: t.Date, DateTime: t.DateTime, TimeZone: t.TimeZone}
}
