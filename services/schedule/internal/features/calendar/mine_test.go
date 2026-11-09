package calendar_test

import (
	"context"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

func TestMine(t *testing.T) {
	e := newEnv(t, nil)
	started := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	e.store.Runs["OLD"] = calendar.ImportRun{ID: "OLD", ExternalCalendarID: calID, Status: calendar.RunSucceeded, StartedAt: started.Add(-time.Hour)}
	e.store.Runs["NEW"] = calendar.ImportRun{ID: "NEW", ExternalCalendarID: calID, Status: calendar.RunSucceeded, StartedAt: started}
	mine := calendar.NewMine(inmem.Calendars{Store: e.store}).Do
	// 職員の管理の権限を持たない職員のトークンで呼ぶ。
	ctx := principal.With(context.Background(), principal.Principal{Staff: principal.Staff{ID: inmem.StaffID, FacilityID: inmem.FacilityID}})

	got, err := mine(ctx, inmem.FacilityID, inmem.StaffID)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.ID != calID || got.LastImport == nil || got.LastImport.ID != "NEW" {
		t.Errorf("結び付いた職員 = %+v, want カレンダー %s と最も新しい取り込み NEW", got, calID)
	}

	got, err = mine(ctx, inmem.FacilityID, inmem.CompanionID)
	if err != nil || got != nil {
		t.Errorf("結び付いていない職員 = %+v, %v, want nil", got, err)
	}

	disabled := e.store.Calendars[calID]
	disabled.DisabledAt = &started
	e.store.Calendars[calID] = disabled
	got, err = mine(ctx, inmem.FacilityID, inmem.StaffID)
	if err != nil || got != nil {
		t.Errorf("外したカレンダー = %+v, %v, want nil", got, err)
	}
}
