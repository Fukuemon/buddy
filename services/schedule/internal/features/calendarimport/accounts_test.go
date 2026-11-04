package calendarimport_test

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// account は、1 つの事業所のサービスアカウントで読み書きする手段である。
type account struct {
	email  string
	source calendar.EventSource
	writer calendar.EventWriter
}

// accounts は、事業所ごとの account を返す calendar.Accounts である。無い事業所には ErrNotConfigured を返す。
// 引かれた事業所を、引かれた順に記録する。
type accounts struct {
	mu   sync.Mutex
	byID map[string]account
	used []string
}

// oneAccount は、inmem.FacilityID の事業所だけに、source と writer のサービスアカウントがある accounts を返す。
// 両方が nil なら、サービスアカウントの設定が無いことを表す nil を返す。
func oneAccount(source calendar.EventSource, writer calendar.EventWriter) calendar.Accounts {
	if source == nil && writer == nil {
		return nil
	}
	return &accounts{byID: map[string]account{inmem.FacilityID: {email: "buddy@example.iam.gserviceaccount.com", source: source, writer: writer}}}
}

func (a *accounts) get(facilityID string) (account, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.used = append(a.used, facilityID)
	acc, ok := a.byID[facilityID]
	if !ok {
		return account{}, calendar.ErrNotConfigured
	}
	return acc, nil
}

func (a *accounts) ServiceAccount(_ context.Context, facilityID string) (string, error) {
	acc, err := a.get(facilityID)
	return acc.email, err
}

func (a *accounts) Source(_ context.Context, facilityID string) (calendar.EventSource, error) {
	acc, err := a.get(facilityID)
	return acc.source, err
}

func (a *accounts) Writer(_ context.Context, facilityID string) (calendar.EventWriter, error) {
	acc, err := a.get(facilityID)
	return acc.writer, err
}

// usedFacilities は、引かれた事業所を、重なりを除いて返す。
func (a *accounts) usedFacilities() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := slices.Clone(a.used)
	slices.Sort(out)
	return slices.Compact(out)
}

// 取り込みは、結び付けたカレンダーの行の事業所のアカウントで読む。
func TestPreviewUsesCalendarFacilityAccount(t *testing.T) {
	e := newEnv(t, nil)
	acc := &accounts{byID: map[string]account{inmem.FacilityID: {source: gcal.NewReader(gcaltest.Start(t, fixture()))}}}
	e.uc = withAccounts(e, acc)
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); err != nil {
		t.Fatal(err)
	}
	if got := acc.usedFacilities(); !slices.Equal(got, []string{inmem.FacilityID}) {
		t.Errorf("引いた事業所 = %v", got)
	}
	c := e.store.Calendars[calID]
	c.FacilityID = inmem.OtherFacilityID
	e.store.Calendars[calID] = c
	if _, err := e.uc.Preview(e.ctx, calID, e.rng); !errors.Is(err, calendar.ErrNotConfigured) {
		t.Errorf("設定の無い事業所のカレンダー: err = %v, want ErrNotConfigured", err)
	}
}
