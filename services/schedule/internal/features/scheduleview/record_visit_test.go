package scheduleview_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestProjectedRecordVisit は、google_primary の事業所の一覧と 1 件の読み出しが、記録の確定した版の訪問の情報がある予定に、
// 記録の利用者、主訪問者、同行者、サービスコード、訪問の区分を返し、タイトルの利用者かサービス内容が訪問の情報と違う予定に
// title_mismatch を付けることを確認する。記録の無い予定と、確定した版の訪問の情報が無い記録の予定は、タイトルを読み替える。
func TestProjectedRecordVisit(t *testing.T) {
	s := googleStore()
	const visitInfoID = "VISIT-RECORD"
	s.Infos[visitInfoID] = visit.Info{
		ID: visitInfoID, FacilityID: facilityID, PatientID: patientID, AssignedStaffID: staffID, CompanionID: ptr(companionID),
		ServiceCodeID: codeID, CategoryIDs: []string{categoryID},
	}
	const pendingInfoID = "VISIT-PENDING"
	s.Infos[pendingInfoID] = visit.Info{ID: pendingInfoID, FacilityID: facilityID, PatientID: patientID, AssignedStaffID: staffID, ServiceCodeID: codeID}
	tests := []struct {
		name  string
		title string
		// record は、予定の記録の訪問の情報の持ち方で、none は記録が無い、confirmed は確定した版の訪問の情報、pending は保留の版の訪問の情報だけを持つ。
		record     string
		wantReason scheduleview.ReviewReason
		// wantRecord は、記録の訪問の情報（同行者と区分を持つ）を返すかで、false ならタイトルから引いた訪問の情報（同行者と区分を持たない）を返す。
		wantRecord bool
	}{
		{name: "タイトルと記録が同じ", title: "【" + visitCode + "】" + patientName, record: "confirmed", wantRecord: true},
		{name: "利用者名のスペースだけが違う", title: "【" + visitCode + "】山田花子", record: "confirmed", wantRecord: true},
		{name: "利用者が違う", title: "【" + visitCode + "】いない 利用者", record: "confirmed", wantReason: scheduleview.ReviewTitleMismatch, wantRecord: true},
		{name: "サービス内容が違う", title: "【訪看X9】" + patientName, record: "confirmed", wantReason: scheduleview.ReviewTitleMismatch, wantRecord: true},
		{name: "訪問の形でないタイトル", title: "カンファレンス", record: "confirmed", wantReason: scheduleview.ReviewTitleMismatch, wantRecord: true},
		{name: "記録が無い", title: "【" + visitCode + "】" + patientName, record: "none"},
		{name: "保留の版の訪問の情報だけを持つ記録", title: "【" + visitCode + "】" + patientName, record: "pending"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s.Projections = map[inmem.ProjectionKey]scheduleview.Projection{}
			s.Records = map[string]calendar.EventRecord{}
			putEvent(s, targetCalendarID, "event", tt.title, tokyo(10, 20, 9), 60, nil)
			const recordID = "01M3TC5H00QV17BC0J9V3393ZP"
			rec := calendar.EventRecord{ScheduleID: recordID, FacilityID: facilityID, ExternalCalendarID: targetCalendarID, ExternalEventID: "event"}
			switch tt.record {
			case "confirmed":
				rec.Version, rec.VisitInfoID = 1, ptr(visitInfoID)
				s.Records[recordID] = rec
			case "pending":
				rec.Pending = &calendar.PendingWrite{Version: 1, State: calendar.PendingUnknown, VisitInfoID: ptr(pendingInfoID), Deadline: tokyo(10, 20, 9)}
				s.Records[recordID] = rec
			}

			list, err := newSchedules(s).List(editorCtx(), facilityID, october())
			if err != nil {
				t.Fatal(err)
			}
			if len(list.Schedules) != 1 {
				t.Fatalf("予定 = %+v, want 1 件", list.Schedules)
			}
			d := list.Schedules[0]
			if d.ReviewReason != tt.wantReason || d.TypeName != schedule.Visit || d.TypeID != visitTypeID || d.Title != nil || d.Visit == nil {
				t.Fatalf("予定 = %+v, Visit = %+v, want 理由 %q の訪問の予定", d, d.Visit, tt.wantReason)
			}
			v := *d.Visit
			if v.PatientID != patientID || v.ServiceCodeID != codeID || v.AssignedStaffID != staffID {
				t.Errorf("Visit = %+v, want 利用者 %s、サービスコード %s、主訪問者 %s", v, patientID, codeID, staffID)
			}
			if tt.wantRecord {
				if v.ID != visitInfoID || d.VisitInfoID == nil || *d.VisitInfoID != visitInfoID || v.CompanionID == nil || *v.CompanionID != companionID ||
					v.CompanionName == nil || *v.CompanionName != "外した 職員" || !reflect.DeepEqual(v.Categories, []visit.Category{{ID: categoryID}}) {
					t.Errorf("Visit = %+v, want 記録の訪問の情報 %s（同行者 %s、区分 %s）", v, visitInfoID, companionID, categoryID)
				}
			} else if v.CompanionID != nil || len(v.Categories) != 0 {
				t.Errorf("Visit = %+v, want タイトルから引いた、同行者と区分の無い訪問の情報", v)
			}

			get := scheduleview.NewGetProjected(projectionDeps(s, func() time.Time { return tokyo(10, 21, 9) }), inmem.StaffRefs{Store: s})
			got, err := get.Do(editorCtx(), facilityID, d.ID)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, d) {
				t.Errorf("1 件 = %+v, 一覧 = %+v", got, d)
			}
		})
	}
}

// TestProjectedExceptionVisit は、繰り返しの予定の例外の回が、回の記録が無ければ親の予定の記録の訪問の情報を返し、
// 回の記録の確定した版があればその訪問の情報を返すことを確認する。展開した回は、親の予定の記録の訪問の情報を返す。
func TestProjectedExceptionVisit(t *testing.T) {
	s := googleStore()
	const parentInfoID, ownInfoID = "VISIT-PARENT", "VISIT-OWN"
	s.Infos[parentInfoID] = visit.Info{
		ID: parentInfoID, FacilityID: facilityID, PatientID: patientID, AssignedStaffID: staffID, CompanionID: ptr(companionID), ServiceCodeID: codeID,
	}
	s.Infos[ownInfoID] = visit.Info{ID: ownInfoID, FacilityID: facilityID, PatientID: patientID, AssignedStaffID: staffID, ServiceCodeID: codeID}
	title := "【" + visitCode + "】" + patientName
	putEvent(s, targetCalendarID, "series", title, tokyo(10, 6, 9), 60, func(p *scheduleview.Projection) {
		p.Recurrence, p.LastEndDate = []string{"RRULE:FREQ=WEEKLY;UNTIL=20261027T145959Z"}, nil
	})
	for _, ex := range []struct {
		id    string
		day   int
		moved time.Time
	}{{"series_a", 13, tokyo(10, 14, 13)}, {"series_b", 20, tokyo(10, 21, 13)}} {
		original := tokyo(10, ex.day, 9)
		putEvent(s, targetCalendarID, ex.id, title, ex.moved, 60, func(p *scheduleview.Projection) {
			p.RecurringEventID, p.OriginalStart = "series", scheduleview.ProjectionTime{At: &original}
		})
	}
	s.Records = map[string]calendar.EventRecord{
		"01M3TC5H00QV17BC0J9V3393ZP": {ScheduleID: "01M3TC5H00QV17BC0J9V3393ZP", FacilityID: facilityID, ExternalCalendarID: targetCalendarID,
			ExternalEventID: "series", Version: 1, VisitInfoID: ptr(parentInfoID)},
		"01M3TC5H00QV17BC0J9V3393ZQ": {ScheduleID: "01M3TC5H00QV17BC0J9V3393ZQ", FacilityID: facilityID, ExternalCalendarID: targetCalendarID,
			ExternalEventID: "series_b", Version: 1, VisitInfoID: ptr(ownInfoID)},
	}

	list, err := newSchedules(s).List(editorCtx(), facilityID, october())
	if err != nil {
		t.Fatal(err)
	}
	visits := map[int]string{}
	for _, d := range list.Schedules {
		if d.Visit == nil {
			t.Fatalf("予定 %s の訪問の情報が無い: %+v", d.Date, d)
		}
		visits[d.Date.Day] = d.Visit.ID
	}
	want := map[int]string{6: parentInfoID, 14: parentInfoID, 21: ownInfoID, 27: parentInfoID}
	if !reflect.DeepEqual(visits, want) {
		t.Errorf("日ごとの訪問の情報 = %v, want %v", visits, want)
	}
}
