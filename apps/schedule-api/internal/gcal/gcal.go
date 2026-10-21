// Package gcal は、Google Calendar API で予定を読み、calendar.EventSource を実装する。
package gcal

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

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
// Calendar API の呼び出しに失敗するとエラーを返す。HTTP の誤りの応答では、*googleapi.Error を包む。
// エラーの文はカレンダー ID（職員のメールアドレスのことがある）を含まない。
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
			for _, ev := range page.Items {
				events = append(events, toEvent(ev))
			}
			return nil
		})
	if err != nil {
		// 通信の誤り（*url.Error）の文は、カレンダー ID を含む要求の URL を持つ。
		var uerr *url.Error
		if errors.As(err, &uerr) {
			err = uerr.Err
		}
		return nil, fmt.Errorf("カレンダーの予定を取れない: %w", err)
	}
	return events, nil
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
