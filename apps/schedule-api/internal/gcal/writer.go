package gcal

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"

	calendarv3 "google.golang.org/api/calendar/v3"
	"google.golang.org/api/googleapi"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/calendar"
)

// Writer は、Google Calendar API で予定を書く calendar.EventWriter である。
type Writer struct {
	svc *calendarv3.Service
}

// NewWriter は、svc で予定を書く Writer を返す。予定を書くには calendar.events のスコープが要る。
func NewWriter(svc *calendarv3.Service) *Writer {
	return &Writer{svc: svc}
}

var _ calendar.EventWriter = (*Writer)(nil)

// Insert は、ID が eventID の予定を作り、etag を返す。参加者に通知を送らない。
// 出典: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
func (w *Writer) Insert(ctx context.Context, calendarID, eventID string, b calendar.EventBody) (string, error) {
	ev := toEventBody(b)
	ev.Id = eventID
	got, err := w.svc.Events.Insert(calendarID, ev).SendUpdates("none").Context(ctx).Do()
	if err != nil {
		return "", writeError("予定を作れない", err)
	}
	return got.Etag, nil
}

// Update は、予定 eventID を b の内容で部分更新し、新しい etag を返す。etag が空でなければ If-Match に付ける。
// 消された予定は、状態を confirmed にして戻す。
// 出典: https://developers.google.com/workspace/calendar/api/guides/version-resources
func (w *Writer) Update(ctx context.Context, calendarID, eventID, etag string, b calendar.EventBody) (string, error) {
	call := w.svc.Events.Patch(calendarID, eventID, toEventBody(b)).SendUpdates("none").Context(ctx)
	if etag != "" {
		call.Header().Set("If-Match", etag)
	}
	got, err := call.Do()
	if err != nil {
		return "", writeError("予定を変えられない", err)
	}
	return got.Etag, nil
}

// Delete は、予定 eventID を消す。etag が空でなければ If-Match に付ける。
func (w *Writer) Delete(ctx context.Context, calendarID, eventID, etag string) error {
	call := w.svc.Events.Delete(calendarID, eventID).SendUpdates("none").Context(ctx)
	if etag != "" {
		call.Header().Set("If-Match", etag)
	}
	if err := call.Do(); err != nil {
		return writeError("予定を消せない", err)
	}
	return nil
}

func toEventBody(b calendar.EventBody) *calendarv3.Event {
	ev := &calendarv3.Event{
		Summary:            b.Summary,
		Status:             "confirmed",
		Start:              &calendarv3.EventDateTime{DateTime: b.Start.DateTime, TimeZone: b.Start.TimeZone},
		End:                &calendarv3.EventDateTime{DateTime: b.End.DateTime, TimeZone: b.End.TimeZone},
		Recurrence:         b.Recurrence,
		ExtendedProperties: &calendarv3.EventExtendedProperties{Private: b.Private},
	}
	if b.Description != nil {
		ev.Description = *b.Description
		// 空の説明も送り、外部の予定の説明を消す。
		ev.ForceSendFields = append(ev.ForceSendFields, "Description")
	}
	return ev
}

// rateLimitReasons は、403 でも一時的な誤りとして書き直す理由である。
// 出典: https://developers.google.com/workspace/calendar/api/guides/errors
var rateLimitReasons = map[string]bool{"rateLimitExceeded": true, "userRateLimitExceeded": true, "quotaExceeded": true}

// writeError は、Calendar API の書き込みの誤りを calendar の誤りで包む。エラーの文は、カレンダー ID と予定の題名を含まない。
func writeError(msg string, err error) error {
	// 通信の誤り（*url.Error）の文は、カレンダー ID を含む要求の URL を持つ。
	var uerr *url.Error
	if errors.As(err, &uerr) {
		err = uerr.Err
	}
	kind := calendar.ErrUnavailable
	var gerr *googleapi.Error
	if errors.As(err, &gerr) {
		switch gerr.Code {
		case http.StatusPreconditionFailed:
			kind = calendar.ErrEventChanged
		case http.StatusGone:
			kind = calendar.ErrEventGone
		case http.StatusNotFound:
			kind = calendar.ErrEventNotFound
		case http.StatusConflict:
			kind = calendar.ErrEventExists
		case http.StatusBadRequest:
			kind = calendar.ErrEventRejected
		case http.StatusForbidden:
			kind = calendar.ErrUnwritable
			for _, e := range gerr.Errors {
				if rateLimitReasons[e.Reason] {
					kind = calendar.ErrUnavailable
				}
			}
		}
	}
	return fmt.Errorf("%s: %w: %w", msg, kind, err)
}
