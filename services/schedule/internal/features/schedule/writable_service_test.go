package schedule_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestRequireWritable(t *testing.T) {
	for _, tt := range []struct {
		mode organization.SourceMode
		ok   bool
	}{
		{organization.SourceBuddyPrimary, true},
		{organization.SourceGooglePrimary, false},
		{"", false},
	} {
		err := schedule.RequireWritable(organization.Facility{SourceMode: tt.mode})
		if tt.ok != (err == nil) {
			t.Errorf("%q: err = %v", tt.mode, err)
		}
		var ce *apperr.ConflictError
		if !tt.ok && (!errors.As(err, &ce) || ce.Code != schedule.CodeGooglePrimary) {
			t.Errorf("%q: err = %v, want code %s", tt.mode, err, schedule.CodeGooglePrimary)
		}
	}
}

// recordedExports は、書き出しの待ちに積もうとした予定を数える schedule.Exports である。
type recordedExports struct{ n *int }

func (r recordedExports) ScheduleChanged(context.Context, string, string, string) error {
	*r.n++
	return nil
}

func (r recordedExports) RecurringChanged(context.Context, string, string, string) error {
	*r.n++
	return nil
}

// Google カレンダーを予定の正本にする事業所では、予定を書く 5 つの操作が 409 で拒まれ、予定も書き出しの待ちも書かない（ADR-0029）。
func TestSchedulesRejectGooglePrimary(t *testing.T) {
	s := inmem.Seeded()
	var queued int
	uc := build(deps{
		Facilities: inmem.Facilities{Store: s}, Staff: inmem.StaffRefs{Store: s}, Locks: inmem.Facilities{Store: s},
		Schedules: inmem.Schedules{Store: s}, Recurring: inmem.RecurringSchedules{Store: s}, Types: inmem.ScheduleTypes{Store: s},
		Exports: recordedExports{&queued}, Now: func() time.Time { return today.Time().Add(9 * time.Hour) },
	}, &inmem.Tx{}, &inmem.SeqIDs{})
	ctx := editorCtx()
	created, err := uc.Create(ctx, facilityID, normalSlot())
	if err != nil {
		t.Fatal(err)
	}
	f := s.Facilities[facilityID]
	f.SourceMode = organization.SourceGooglePrimary
	s.Facilities[facilityID] = f
	schedules, recurring, before := len(s.Schedules), len(s.Recurring), queued

	occurrence := civil.Date{Year: 2026, Month: 10, Day: 12}
	for name, do := range map[string]func() error{
		"作成": func() error { _, err := uc.Create(ctx, facilityID, normalSlot()); return err },
		"繰り返しの予定の作成": func() error {
			_, err := uc.CreateRecurring(ctx, facilityID, normalSlot(), schedule.RuleInput{Frequency: schedule.Weekly})
			return err
		},
		"回の置き換え": func() error { _, err := uc.ChangeOccurrence(ctx, recurringID, occurrence, normalSlot()); return err },
		"変更":     func() error { _, err := uc.Update(ctx, created.ID, normalSlot()); return err },
		"キャンセル":  func() error { _, err := uc.Cancel(ctx, created.ID, "体調不良"); return err },
	} {
		var ce *apperr.ConflictError
		if err := do(); !errors.As(err, &ce) || ce.Code != schedule.CodeGooglePrimary {
			t.Errorf("%s: err = %v, want code %s の ErrConflict", name, err, schedule.CodeGooglePrimary)
		}
	}
	if len(s.Schedules) != schedules || len(s.Recurring) != recurring || queued != before {
		t.Errorf("予定 %d → %d、繰り返しの予定 %d → %d、書き出しの待ち %d → %d, want 変わらない",
			schedules, len(s.Schedules), recurring, len(s.Recurring), before, queued)
	}
	if len(s.Cancels) != 0 || len(s.Recurring[recurringID].ExclusionDates) != 0 {
		t.Errorf("キャンセル %v、除外する日 %v, want 書かない", s.Cancels, s.Recurring[recurringID].ExclusionDates)
	}
	if got := s.Schedules[created.ID]; got.Date != normalSlot().Date || *got.Title != "カンファレンス" {
		t.Errorf("変えられない予定 = %+v", got.Slot)
	}
}
