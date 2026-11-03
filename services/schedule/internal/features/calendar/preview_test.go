package calendar_test

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"testing"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestPreview(t *testing.T) {
	e := newEnv(t, fixture())
	p, err := e.uc.Preview(e.ctx, calID, e.rng)
	if err != nil {
		t.Fatal(err)
	}
	want := calendar.Counts{
		// visit、meeting、weekly、weekly の 11-16 の置き換え、biweekly の 2 回
		Import: 6, ImportVisit: 3, ImportNormal: 3, ExpandedOccurrences: 2,
		Recurring: 2, RecurringAsRule: 1, RecurringExpanded: 1,
		NeedsReview: 2, Skipped: 2,
	}
	if p.Counts != want {
		t.Errorf("Counts = %+v, want %+v", p.Counts, want)
	}
	if got := reviewIDs(p.ReviewItems); !slices.Equal(got, []string{"ambiguous", "missing"}) {
		t.Errorf("NeedsReview = %v", got)
	}
	amb := p.ReviewItems[0]
	if amb.Reason != calendar.ReviewPatientAmbiguous || len(amb.Candidates) != 2 || amb.Client != "利用者B" || amb.Service != "訪看I2" {
		t.Errorf("ambiguous = %+v", amb)
	}
	if p.ReviewItems[1].Reason != calendar.ReviewPatientNotFound || len(p.ReviewItems[1].Candidates) != 0 {
		t.Errorf("missing = %+v", p.ReviewItems[1])
	}
	var reasons []calendar.SkipReason
	for _, s := range p.SkippedItems {
		reasons = append(reasons, s.Reason)
	}
	if !slices.Equal(reasons, []calendar.SkipReason{calendar.SkipAllDay, calendar.SkipServiceNotFound}) {
		t.Errorf("Skipped = %v", reasons)
	}
	if len(e.store.Schedules)+len(e.store.Links) != 0 {
		t.Errorf("プレビューで予定か対応を書いた")
	}
}

func TestPreviewErrors(t *testing.T) {
	e := newEnv(t, &gcaltest.Server{Status: http.StatusNotFound})
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, calendar.ErrUnreadable) {
		t.Errorf("404: err = %v, want ErrUnreadable", err)
	}
	e = newEnv(t, &gcaltest.Server{Status: http.StatusInternalServerError})
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, calendar.ErrUnavailable) {
		t.Errorf("500: err = %v, want ErrUnavailable", err)
	}
	e = newEnv(t, nil)
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, calendar.ErrNotConfigured) {
		t.Errorf("設定なし: err = %v, want ErrNotConfigured", err)
	}
	if _, err := e.uc.ServiceAccount(e.ctx, inmem.FacilityID); !errors.Is(err, calendar.ErrNotConfigured) {
		t.Errorf("設定なし: ServiceAccount の err = %v", err)
	}
	e = newEnv(t, fixture())
	if err := e.uc.Unlink(e.ctx, calID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("外したカレンダー: err = %v, want ErrNotFound", err)
	}
	if _, err := e.uc.Preview(context.Background(), calID, e.rng); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("権限なし: err = %v, want ErrForbidden", err)
	}
}

func TestPreviewCountsSeriesOnlyMovedOut(t *testing.T) {
	srv := &gcaltest.Server{
		Calendars: map[string][][]*calendarv3.Event{googleCalID: {{
			grecurring(gevent("biweekly", "定例", "2026-11-17T16:00:00+09:00", "2026-11-17T17:00:00+09:00"),
				"RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=1"),
			gexception("biweekly_1117", "biweekly", "定例", "2026-12-01T16:00:00+09:00", "2026-12-01T17:00:00+09:00", "2026-11-17T16:00:00+09:00"),
		}}},
		Instances: map[string][]*calendarv3.Event{"biweekly": {}},
	}
	e := newEnv(t, srv)
	e.uc = withSource(e, startFiltered{gcal.NewReader(gcaltest.Start(t, srv))})
	p, err := e.uc.Preview(e.ctx, calID, e.rng)
	if err != nil {
		t.Fatal(err)
	}
	if p.Counts.Import != 1 || p.Counts.Recurring != 1 || p.Counts.RecurringExpanded != 1 {
		t.Errorf("プレビューの件数 = %+v, want 期間の外へ動かした回だけの繰り返しも 1 件に数える", p.Counts)
	}
}
