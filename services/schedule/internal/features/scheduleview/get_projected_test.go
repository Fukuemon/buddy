package scheduleview_test

import (
	"errors"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestGetProjected は、一覧の予定を、一覧と同じ ID と内容と etag で 1 件読めることと、記録のある予定の ID が記録の予定の ID になること、
// 見てよくない職員の予定と、取り消した予定と、ほかの事業所の予定を返さないことを確認する。
func TestGetProjected(t *testing.T) {
	s := googleStore()
	putEvent(s, targetCalendarID, "google", "カンファレンス", tokyo(10, 20, 9), 60, nil)
	putEvent(s, targetCalendarID, "written", "【訪看I2】山田 花子", tokyo(10, 21, 9), 60, nil)
	putEvent(s, targetCalendarID, "cancelled", "取り消した予定", tokyo(10, 22, 9), 60, func(p *scheduleview.Projection) {
		p.Status = scheduleview.ProjectionCancelled
	})
	putEvent(s, otherCalendarID, "other", "ほかの事業所の予定", tokyo(10, 20, 9), 60, nil)
	const recordID = "01M3TC5H00QV17BC0J9V3393ZP"
	s.Records[recordID] = calendar.EventRecord{ScheduleID: recordID, FacilityID: facilityID, ExternalCalendarID: targetCalendarID, ExternalEventID: "written", Version: 1}
	now := func() time.Time { return tokyo(10, 21, 9) }
	get := scheduleview.NewGetProjected(projectionDeps(s, now), inmem.StaffRefs{Store: s})
	reader := viewerCtx(staff.PolicyGrant{PolicyCode: organization.ScheduleAllRead})

	list, err := newSchedules(s).List(reader, facilityID, october())
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, want := range list.Schedules {
		ids[want.ID] = true
		got, err := get.Do(reader, facilityID, want.ID)
		if err != nil {
			t.Fatalf("%s: %v", want.ID, err)
		}
		if got.ID != want.ID || got.Date != want.Date || got.TypeName != want.TypeName || got.ETag == "" || got.ETag != want.ETag {
			t.Errorf("1 件 = %+v, 一覧 = %+v", got, want)
		}
	}
	googleID := scheduleview.ProjectedScheduleID(targetCalendarID, "google")
	if len(ids) != 2 || !ids[googleID] || !ids[recordID] {
		t.Errorf("一覧の ID = %v, want %s と記録の %s", ids, googleID, recordID)
	}

	if _, err := get.Do(viewerCtx(), facilityID, googleID); !errors.Is(err, apperr.ErrForbidden) {
		t.Errorf("見てよくない職員の予定: err = %v, want ErrForbidden", err)
	}
	for name, id := range map[string]string{
		"取り消した予定":   scheduleview.ProjectedScheduleID(targetCalendarID, "cancelled"),
		"ほかの事業所の予定": scheduleview.ProjectedScheduleID(otherCalendarID, "other"),
	} {
		if _, err := get.Do(reader, facilityID, id); !errors.Is(err, apperr.ErrNotFound) {
			t.Errorf("%s: err = %v, want ErrNotFound", name, err)
		}
	}
}
