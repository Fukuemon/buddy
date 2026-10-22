package gcal_test

import (
	"context"
	"errors"
	"testing"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/packages/go/gcalauth"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
)

// orgClients は、組織ごとのサービスアカウントと calendarv3.Service を返す gcal.Clients である。
type orgClients map[string]struct {
	email string
	svc   *calendarv3.Service
}

func (c orgClients) Account(orgID string) (string, error) {
	a, ok := c[orgID]
	if !ok {
		return "", gcalauth.ErrNoAccount
	}
	return a.email, nil
}

func (c orgClients) Service(orgID string) (*calendarv3.Service, error) {
	a, ok := c[orgID]
	if !ok {
		return nil, gcalauth.ErrNoAccount
	}
	return a.svc, nil
}

func TestAccounts(t *testing.T) {
	own := gcaltest.Start(t, &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{"own@example.com": {}}})
	other := gcaltest.Start(t, &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{"other@example.com": {}}})
	clients := orgClients{
		"org-own":   {email: "own@example.iam.gserviceaccount.com", svc: own},
		"org-other": {email: "other@example.iam.gserviceaccount.com", svc: other},
	}
	orgs := map[string]string{"F-OWN": "org-own", "F-OTHER": "org-other", "F-UNLINKED": "", "F-NOACCOUNT": "org-none"}
	a := gcal.NewAccounts(clients, func(_ context.Context, facilityID string) (string, error) {
		org, ok := orgs[facilityID]
		if !ok {
			return "", apperr.ErrNotFound
		}
		return org, nil
	})
	ctx := t.Context()

	if email, err := a.ServiceAccount(ctx, "F-OWN"); err != nil || email != "own@example.iam.gserviceaccount.com" {
		t.Errorf("ServiceAccount(F-OWN) = %q, %v", email, err)
	}
	src, err := a.Source(ctx, "F-OWN")
	if err != nil {
		t.Fatal(err)
	}
	if err := src.Check(ctx, "own@example.com"); err != nil {
		t.Errorf("自分の事業所のカレンダーを読めない: %v", err)
	}
	if err := src.Check(ctx, "other@example.com"); !errors.Is(err, calendar.ErrUnreadable) {
		t.Errorf("別の事業所のカレンダー: err = %v, want ErrUnreadable", err)
	}
	if w, err := a.Writer(ctx, "F-OTHER"); err != nil || w == nil {
		t.Errorf("Writer(F-OTHER) = %v, %v", w, err)
	}
	for _, f := range []string{"F-UNLINKED", "F-NOACCOUNT", "F-MISSING"} {
		if _, err := a.ServiceAccount(ctx, f); !errors.Is(err, calendar.ErrNotConfigured) {
			t.Errorf("ServiceAccount(%s): err = %v, want ErrNotConfigured", f, err)
		}
		if _, err := a.Source(ctx, f); !errors.Is(err, calendar.ErrNotConfigured) {
			t.Errorf("Source(%s): err = %v, want ErrNotConfigured", f, err)
		}
		if _, err := a.Writer(ctx, f); !errors.Is(err, calendar.ErrNotConfigured) {
			t.Errorf("Writer(%s): err = %v, want ErrNotConfigured", f, err)
		}
	}
}
