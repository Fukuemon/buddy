package calendar_test

import (
	"context"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

const (
	calID       = "CAL"
	googleCalID = "staff@example.com"
)

type env struct {
	store *inmem.Store
	uc    *app
	ctx   context.Context
}

func newEnv(t *testing.T, srv *gcaltest.Server) env {
	t.Helper()
	s := inmem.Seeded()
	s.Calendars[calID] = calendar.ExternalCalendar{ID: calID, FacilityID: inmem.FacilityID, StaffID: inmem.StaffID, Provider: calendar.ProviderGoogle, CalendarID: googleCalID}
	e := env{store: s, ctx: manager()}
	var source calendar.EventSource
	if srv != nil {
		source = gcal.NewReader(gcaltest.Start(t, srv))
	}
	e.uc = withLocks(e, source, inmem.Facilities{Store: e.store})
	return e
}

// withLocks は、e の Store の上で、自分の事業所のサービスアカウントの source で予定を読み、事業所を locks でロックする App を作る。
func withLocks(e env, source calendar.EventSource, locks calendar.FacilityLock) *app {
	return newApp(e, oneAccount(source, nil), locks)
}

// withAccounts は、e の Store の上で、事業所ごとのサービスアカウント acc で予定を読む App を作る。
func withAccounts(e env, acc calendar.Accounts) *app {
	return newApp(e, acc, inmem.Facilities{Store: e.store})
}

func newApp(e env, acc calendar.Accounts, locks calendar.FacilityLock) *app {
	return build(deps{Calendars: inmem.Calendars{Store: e.store}, Accounts: acc, Staff: inmem.StaffRefs{Store: e.store}, Locks: locks}, &inmem.Tx{}, &inmem.SeqIDs{}, principal.RequireStaffManage)
}

func manager() context.Context {
	return principal.With(context.Background(), principal.Principal{Staff: staff.Detail{
		Summary:  staff.Summary{Staff: staff.Staff{ID: inmem.StaffID, FacilityID: inmem.FacilityID}},
		Policies: []staff.PolicyGrant{{PolicyCode: "staff.manage"}},
	}})
}

// deps は、テストが calendar の操作の型に渡す依存である。テストが使わない依存は nil のままにする。
type deps struct {
	Calendars calendar.Repository
	Accounts  calendar.Accounts
	Staff     calendar.StaffRefs
	Locks     calendar.FacilityLock
}

// app は、テストが呼ぶ calendar の操作の Do である。
type app struct {
	ServiceAccount func(ctx context.Context, facilityID string) (string, error)
	List           func(ctx context.Context, facilityID string) ([]calendar.ExternalCalendar, error)
	Check          func(ctx context.Context, facilityID, calendarID string) error
	Link           func(ctx context.Context, facilityID, staffID, calendarID string) (calendar.ExternalCalendar, error)
	Unlink         func(ctx context.Context, id string) error
}

// build は、d の依存で calendar の全ての操作の型を作る。
func build(d deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *app {
	return &app{
		ServiceAccount: calendar.NewServiceAccount(d.Accounts, guard).Do,
		List:           calendar.NewList(d.Calendars, guard).Do,
		Check:          calendar.NewCheck(d.Accounts, guard).Do,
		Link:           calendar.NewLink(d.Accounts, d.Staff, d.Locks, d.Calendars, tx, ids, guard).Do,
		Unlink:         calendar.NewUnlink(d.Calendars, guard).Do,
	}
}
