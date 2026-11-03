package postgres

import (
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
)

func TestCalendarExportRepository(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarExportRepository(testDB)
	const (
		exportID = "01M3TD000000000000000000X0"
		nextID   = "01M3TD000000000000000000X1"
		otherID  = "01M3TD000000000000000000X2"
	)
	target := calendar.Target{FacilityID: seedFacility, ScheduleID: seedConference}
	for _, id := range []string{exportID, nextID} {
		if err := r.Enqueue(ctx, id, target); err != nil {
			t.Fatal(err)
		}
	}
	e, err := r.Get(ctx, exportID)
	if err != nil || e.Revision != 2 || e.Status != calendar.ExportPending {
		t.Fatalf("積み直した待ち = %+v, %v", e, err)
	}
	if _, err := r.Get(ctx, nextID); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("終わっていない待ちがあるのに足した: %v", err)
	}

	claimed, err := r.Claim(ctx, 10, time.Minute)
	if err != nil || len(claimed) != 1 || claimed[0].ID != exportID || claimed[0].Attempts != 1 || claimed[0].ScheduleID != seedConference {
		t.Fatalf("Claim = %+v, %v", claimed, err)
	}
	if again, err := r.Claim(ctx, 10, time.Minute); err != nil || len(again) != 0 {
		t.Errorf("lease の間に取った: %+v, %v", again, err)
	}

	// 書いている間に積み直されたら、成功でも pending のまま残し、すぐに取れるようにする
	if err := r.Enqueue(ctx, nextID, target); err != nil {
		t.Fatal(err)
	}
	if err := r.Finish(ctx, claimed[0], calendar.ExportResult{Status: calendar.ExportSucceeded}); err != nil {
		t.Fatal(err)
	}
	if e, _ := r.Get(ctx, exportID); e.Status != calendar.ExportPending || e.Attempts != 0 {
		t.Errorf("積み直された待ち = %+v", e)
	}
	claimed, err = r.Claim(ctx, 10, time.Minute)
	if err != nil || len(claimed) != 1 {
		t.Fatalf("積み直された待ちの Claim = %+v, %v", claimed, err)
	}
	if err := r.Finish(ctx, claimed[0], calendar.ExportResult{Status: calendar.ExportSucceeded}); err != nil {
		t.Fatal(err)
	}
	if e, _ := r.Get(ctx, exportID); e.Status != calendar.ExportSucceeded {
		t.Errorf("書き終えた待ち = %+v", e)
	}

	// 書き終えた後の変更は、新しい待ちになる
	if err := r.Enqueue(ctx, nextID, target); err != nil {
		t.Fatal(err)
	}
	claimed, _ = r.Claim(ctx, 10, time.Minute)
	if len(claimed) != 1 || claimed[0].ID != nextID {
		t.Fatalf("新しい待ち = %+v", claimed)
	}
	code := calendar.ErrorPreconditionFailed
	if err := r.Finish(ctx, claimed[0], calendar.ExportResult{Status: calendar.ExportConflict, ErrorCode: &code}); err != nil {
		t.Fatal(err)
	}
	issues, err := r.ListIssues(ctx, seedFacility)
	if err != nil || len(issues) != 1 {
		t.Fatalf("ListIssues = %+v, %v", issues, err)
	}
	if i := issues[0]; i.ID != nextID || i.StaffName == "" || i.Date.IsZero() || !i.StartTime.Before(i.EndTime) || *i.ErrorCode != code {
		t.Errorf("確認が必要な待ち = %+v", i)
	}
	// 確認が必要な待ちは、積み直しても状態と書く時刻を変えない
	if err := r.Enqueue(ctx, otherID, target); err != nil {
		t.Fatal(err)
	}
	if e, _ := r.Get(ctx, nextID); e.Status != calendar.ExportConflict || e.Revision != 2 {
		t.Errorf("確認が必要な待ちを積み直した = %+v", e)
	}
	if again, _ := r.Claim(ctx, 10, time.Minute); len(again) != 0 {
		t.Errorf("確認が必要な待ちを取った: %+v", again)
	}

	if err := r.Retry(ctx, nextID); err != nil {
		t.Fatal(err)
	}
	if e, _ := r.Get(ctx, nextID); e.Status != calendar.ExportPending || !e.Overwrite || e.Attempts != 0 || e.ErrorCode != nil {
		t.Errorf("書き直す待ち = %+v", e)
	}
	if err := r.Retry(ctx, nextID); !errors.Is(err, apperr.ErrConflict) {
		t.Errorf("確認が必要な待ちでない Retry: %v", err)
	}

	// 一時的なエラーは、書く時刻を遅らせて pending に戻す。失敗した待ちは、積み直すと数え直す
	claimed, _ = r.Claim(ctx, 10, time.Minute)
	unavailable := calendar.ErrorUnavailable
	if err := r.Finish(ctx, claimed[0], calendar.ExportResult{Status: calendar.ExportPending, ErrorCode: &unavailable, RetryAfter: time.Minute}); err != nil {
		t.Fatal(err)
	}
	if again, _ := r.Claim(ctx, 10, time.Minute); len(again) != 0 {
		t.Errorf("書き直す時刻の前に取った: %+v", again)
	}
	if err := r.Finish(ctx, claimed[0], calendar.ExportResult{Status: calendar.ExportFailed, ErrorCode: &unavailable}); err != nil {
		t.Fatal(err)
	}
	if err := r.Enqueue(ctx, otherID, target); err != nil {
		t.Fatal(err)
	}
	if e, _ := r.Get(ctx, nextID); e.Status != calendar.ExportPending || e.Attempts != 0 || e.ErrorCode != nil {
		t.Errorf("失敗した待ちを積み直した = %+v", e)
	}

	recurring := calendar.Target{FacilityID: seedFacility, RecurringScheduleID: seedRecurring}
	if err := r.Enqueue(ctx, otherID, recurring); err != nil {
		t.Fatal(err)
	}
	if e, err := r.Get(ctx, otherID); err != nil || e.RecurringScheduleID != seedRecurring || e.ScheduleID != "" {
		t.Errorf("繰り返しの予定の待ち = %+v, %v", e, err)
	}
}

func TestScheduleVersion(t *testing.T) {
	ctx := txContext(t)
	schedules := NewScheduleRepository(testDB)
	d, err := schedules.Get(ctx, seedConference)
	if err != nil || d.Version != 1 {
		t.Fatalf("Version = %d, %v", d.Version, err)
	}
	if err := schedules.Update(ctx, d.Schedule); err != nil {
		t.Fatal(err)
	}
	if err := schedules.CreateCancel(ctx, schedule.Cancel{ID: "01M3TD000000000000000000Y0", ScheduleID: seedConference, Reason: "中止"}); err != nil {
		t.Fatal(err)
	}
	if d, _ := schedules.Get(ctx, seedConference); d.Version != 3 {
		t.Errorf("変えてキャンセルした後の Version = %d", d.Version)
	}

	recurring := NewRecurringScheduleRepository(testDB)
	rs, err := recurring.Get(ctx, seedRecurring)
	if err != nil {
		t.Fatal(err)
	}
	day := rs.Date
	for !rs.IsOccurring(day) {
		day = civil.DateOf(day.Time().AddDate(0, 0, 1))
	}
	if err := recurring.AddExclusion(ctx, seedRecurring, day); err != nil {
		t.Fatal(err)
	}
	if got, _ := recurring.Get(ctx, seedRecurring); got.Version != rs.Version+1 {
		t.Errorf("除外した後の Version = %d、前 %d", got.Version, rs.Version)
	}
}

func TestCalendarLinksForExport(t *testing.T) {
	ctx := txContext(t)
	r := NewCalendarRepository(testDB)
	const (
		calID  = "01M3TD000000000000000000C0"
		linkID = "01M3TD000000000000000000K0"
	)
	if _, err := r.ActiveByStaff(ctx, seedMori); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("カレンダーの無い職員: %v", err)
	}
	if err := r.Create(ctx, calendar.ExternalCalendar{ID: calID, FacilityID: seedFacility, StaffID: seedMori, Provider: calendar.ProviderGoogle, CalendarID: "mori@example.com"}); err != nil {
		t.Fatal(err)
	}
	if c, err := r.ActiveByStaff(ctx, seedMori); err != nil || c.ID != calID {
		t.Errorf("ActiveByStaff = %+v, %v", c, err)
	}
	sid := seedConference
	if err := r.CreateLink(ctx, calendar.Link{ID: linkID, FacilityID: seedFacility, ExternalCalendarID: calID, ExternalEventID: "ev1", ETag: `"1"`, ScheduleID: &sid}); err != nil {
		t.Fatal(err)
	}
	if err := r.UpdateLink(ctx, linkID, `"2"`, 4); err != nil {
		t.Fatal(err)
	}
	l, err := r.LinkBySchedule(ctx, seedConference)
	if err != nil || l.ETag != `"2"` || l.SyncedVersion == nil || *l.SyncedVersion != 4 {
		t.Fatalf("LinkBySchedule = %+v, %v", l, err)
	}
	if _, err := r.LinkByRecurringSchedule(ctx, seedRecurring); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("対応の無い繰り返しの予定: %v", err)
	}
	if err := r.DeleteLink(ctx, linkID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.LinkBySchedule(ctx, seedConference); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("消した対応: %v", err)
	}
	if err := r.Disable(ctx, calID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.ActiveByStaff(ctx, seedMori); !errors.Is(err, apperr.ErrNotFound) {
		t.Errorf("外したカレンダー: %v", err)
	}
}
