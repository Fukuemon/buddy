package calendarimport_test

import (
	"errors"
	"slices"
	"testing"
	"time"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal"
	"github.com/Fukuemon/buddy/services/schedule/internal/gcal/gcaltest"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestImport(t *testing.T) {
	e := newEnv(t, fixture())
	res, err := e.importDecided(t, e.rng, decisions())
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.Status != calendar.RunSucceeded || res.Run.ImportedCount != 8 || res.Run.SkippedCount != 2 || res.AlreadyImported != 0 {
		t.Errorf("Run = %+v, AlreadyImported = %d", res.Run, res.AlreadyImported)
	}
	if len(e.store.Schedules) != 7 || len(e.store.Recurring) != 2 || len(e.store.Links) != 8 {
		t.Fatalf("予定 %d、繰り返し %d、対応 %d", len(e.store.Schedules), len(e.store.Recurring), len(e.store.Links))
	}
	rs := recurringOf(t, e, "weekly")
	if rs.Rule.Frequency != schedule.Weekly || *rs.Rule.DayOfWeek != 1 || rs.Date != (civil.Date{Year: 2026, Month: 11, Day: 2}) {
		t.Errorf("繰り返し = %+v", rs)
	}
	nov := func(d int) civil.Date { return civil.Date{Year: 2026, Month: 11, Day: d} }
	if !slices.Equal(rs.ExclusionDates, []civil.Date{nov(9), nov(16)}) {
		t.Errorf("除外の日 = %v", rs.ExclusionDates)
	}
	moved := scheduleOf(t, e, "weekly_20261116")
	if moved.RecurringScheduleID == nil || *moved.RecurringScheduleID != rs.ID || *moved.OriginalDate != nov(16) || moved.StartTime.Hour != 15 {
		t.Errorf("置き換え = %+v", moved)
	}
	amb := scheduleOf(t, e, "ambiguous")
	if info := e.store.Infos[*amb.VisitInfoID]; info.PatientID != "PB2" || info.AssignedStaffID != inmem.StaffID || info.ServiceCodeID != codeI2 {
		t.Errorf("選んだ利用者の訪問の情報 = %+v", info)
	}
	if missing := scheduleOf(t, e, "missing"); missing.Title == nil || *missing.Title != "【訪看I2】利用者Z" || missing.VisitInfoID != nil {
		t.Errorf("通常の予定にした予定 = %+v", missing)
	}
	if inst := scheduleOf(t, e, "biweekly_20261117"); inst.RecurringScheduleID != nil || *inst.Title != "定例" {
		t.Errorf("回ごとにした予定 = %+v", inst)
	}

	// 同じ期間を 2 回確定しても、予定は重ならない。
	again, err := e.importDecided(t, e.rng, nil)
	if err != nil {
		t.Fatal(err)
	}
	if again.Run.ImportedCount != 0 || again.AlreadyImported != 8 {
		t.Errorf("2 回目 = %+v, AlreadyImported = %d", again.Run, again.AlreadyImported)
	}
	if len(e.store.Schedules) != 7 || len(e.store.Recurring) != 2 {
		t.Errorf("2 回目で予定が増えた: %d、%d", len(e.store.Schedules), len(e.store.Recurring))
	}
}

func TestImportAppliesLaterExceptionsToLinkedRecurring(t *testing.T) {
	srv := fixture()
	e := newEnv(t, srv)
	if _, err := e.importDecided(t, e.rng, decisions()); err != nil {
		t.Fatal(err)
	}
	// 12 月の期間には、前の取り込みの繰り返しの親と、12-07 の取り消しと 12-14 の変更が来る。
	srv.Calendars[googleCalID] = [][]*calendarv3.Event{{
		grecurring(gevent("weekly", "【訪看I2】利用者A", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00"),
			"RRULE:FREQ=WEEKLY;BYDAY=MO"),
		gcancelled("weekly_20261207", "weekly", "2026-12-07T09:00:00+09:00"),
		gexception("weekly_20261214", "weekly", "【訪看I2】利用者A", "2026-12-14T11:00:00+09:00", "2026-12-14T11:30:00+09:00", "2026-12-14T09:00:00+09:00"),
	}}
	dec, err := calendarimport.NewRange(civil.Date{Year: 2026, Month: 12, Day: 1}, civil.Date{Year: 2026, Month: 12, Day: 31})
	if err != nil {
		t.Fatal(err)
	}
	res, err := e.importDecided(t, dec, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.ImportedCount != 1 || res.AlreadyImported != 1 {
		t.Errorf("Run = %+v, AlreadyImported = %d", res.Run, res.AlreadyImported)
	}
	rs := recurringOf(t, e, "weekly")
	if !slices.Contains(rs.ExclusionDates, civil.Date{Year: 2026, Month: 12, Day: 7}) || !slices.Contains(rs.ExclusionDates, civil.Date{Year: 2026, Month: 12, Day: 14}) {
		t.Errorf("除外の日 = %v", rs.ExclusionDates)
	}
	if moved := scheduleOf(t, e, "weekly_20261214"); moved.RecurringScheduleID == nil || *moved.RecurringScheduleID != rs.ID {
		t.Errorf("置き換え = %+v", moved)
	}
}

func TestImportRejects(t *testing.T) {
	tests := []struct {
		name      string
		decisions []calendarimport.Decision
		running   bool
		want      error
	}{
		{name: "確認が必要な予定の取り込み方が足りない", decisions: decisions()[:1], want: apperr.ErrConflict},
		{name: "確認が必要な予定でない予定の取り込み方を送った",
			decisions: append(decisions(), calendarimport.Decision{ExternalEventID: "visit", Action: calendarimport.ActionSkip}), want: apperr.ErrConflict},
		{name: "選んだ利用者がいない",
			decisions: []calendarimport.Decision{{ExternalEventID: "ambiguous", Action: calendarimport.ActionPatient, PatientID: inmem.OtherPatientID}, decisions()[1]},
			want:      apperr.ErrInvalidInput},
		{name: "取り込みが進んでいる", decisions: decisions(), running: true, want: apperr.ErrConflict},
		{name: "プレビューの後に確認が必要な予定が変わった（バージョンが違う）",
			decisions: []calendarimport.Decision{{ExternalEventID: "ambiguous", Action: calendarimport.ActionPatient, PatientID: "PB2", Revision: "stale"}, decisions()[1]},
			want:      apperr.ErrConflict},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newEnv(t, fixture())
			if tt.running {
				if err := (inmem.Calendars{Store: e.store}).CreateRun(e.ctx, calendar.ImportRun{ID: "RUN", ExternalCalendarID: calID, Status: calendar.RunRunning}); err != nil {
					t.Fatal(err)
				}
			}
			_, err := e.importDecided(t, e.rng, tt.decisions)
			if !errors.Is(err, tt.want) {
				t.Fatalf("err = %v, want %v", err, tt.want)
			}
			if len(e.store.Schedules)+len(e.store.Recurring)+len(e.store.Links) != 1 {
				// Seeded が入れた繰り返しの予定 1 件だけが残る。
				t.Errorf("何か書いた: 予定 %d、繰り返し %d、対応 %d", len(e.store.Schedules), len(e.store.Recurring), len(e.store.Links))
			}
			if tt.running {
				return
			}
			for _, r := range e.store.Runs {
				if r.Status != calendar.RunFailed {
					t.Errorf("取り込みの記録 = %+v, want failed", r)
				}
			}
		})
	}
}

// reviewSeries は、利用者を 1 人に決められない毎週の繰り返しと、タイトルが親と同じ変えた回と、タイトルを変えた回である。
func reviewSeries() *gcaltest.Server {
	return &gcaltest.Server{
		Calendars: map[string][][]*calendarv3.Event{googleCalID: {{
			grecurring(gevent("series", "【訪看I2】利用者B", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00"),
				"RRULE:FREQ=WEEKLY;BYDAY=MO"),
			gexception("series_1109", "series", "【訪看I2】利用者B", "2026-11-09T10:00:00+09:00", "2026-11-09T10:30:00+09:00", "2026-11-09T09:00:00+09:00"),
			gexception("series_1116", "series", "会議", "2026-11-16T15:00:00+09:00", "2026-11-16T16:00:00+09:00", "2026-11-16T09:00:00+09:00"),
		}}},
		Instances: map[string][]*calendarv3.Event{"series": {
			gexception("series_1102", "series", "【訪看I2】利用者B", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00", "2026-11-02T09:00:00+09:00"),
			gexception("series_1109", "series", "【訪看I2】利用者B", "2026-11-09T10:00:00+09:00", "2026-11-09T10:30:00+09:00", "2026-11-09T09:00:00+09:00"),
			gexception("series_1116", "series", "会議", "2026-11-16T15:00:00+09:00", "2026-11-16T16:00:00+09:00", "2026-11-16T09:00:00+09:00"),
			gexception("series_1123", "series", "【訪看I2】利用者B", "2026-11-23T09:00:00+09:00", "2026-11-23T09:30:00+09:00", "2026-11-23T09:00:00+09:00"),
			gexception("series_1130", "series", "【訪看I2】利用者B", "2026-11-30T09:00:00+09:00", "2026-11-30T09:30:00+09:00", "2026-11-30T09:00:00+09:00"),
		}},
	}
}

func TestImportReviewedRecurring(t *testing.T) {
	t.Run("タイトルが親と同じ回は、親の確認にまとめ、選んだ利用者を規則と回に当てる", func(t *testing.T) {
		e := newEnv(t, reviewSeries())
		p, err := e.uc.Preview(e.ctx, calID, e.rng)
		if err != nil {
			t.Fatal(err)
		}
		if got := reviewIDs(p.ReviewItems); !slices.Equal(got, []string{"series"}) || p.ReviewItems[0].Recurrence == nil {
			t.Fatalf("ReviewItems = %+v", p.ReviewItems)
		}
		res, err := e.importDecided(t, e.rng, []calendarimport.Decision{{ExternalEventID: "series", Action: calendarimport.ActionPatient, PatientID: "PB1"}})
		if err != nil {
			t.Fatal(err)
		}
		// 繰り返し、11-09 の置き換え、11-16 の置き換え（通常の予定）
		if res.Run.ImportedCount != 3 {
			t.Errorf("Run = %+v", res.Run)
		}
		rs := recurringOf(t, e, "series")
		if e.store.Infos[*rs.VisitInfoID].PatientID != "PB1" || len(rs.ExclusionDates) != 2 {
			t.Errorf("繰り返し = %+v", rs)
		}
		if moved := scheduleOf(t, e, "series_1109"); e.store.Infos[*moved.VisitInfoID].PatientID != "PB1" || moved.RecurringScheduleID == nil {
			t.Errorf("11-09 の置き換え = %+v", moved)
		}
	})

	t.Run("親を取り込まないと選んだ後に親を取り込むと、回ごとにして前に取り込んだ回と重ねない", func(t *testing.T) {
		e := newEnv(t, reviewSeries())
		res, err := e.importDecided(t, e.rng, []calendarimport.Decision{{ExternalEventID: "series", Action: calendarimport.ActionSkip}})
		if err != nil {
			t.Fatal(err)
		}
		// タイトルを変えた 11-16 の回だけが、置き換える繰り返しの無い単発の予定になる
		if res.Run.ImportedCount != 1 || res.Run.SkippedCount != 2 {
			t.Fatalf("1 回目 = %+v", res.Run)
		}
		if moved := scheduleOf(t, e, "series_1116"); moved.RecurringScheduleID != nil {
			t.Errorf("11-16 = %+v, want 単発の予定", moved)
		}

		p, err := e.uc.Preview(e.ctx, calID, e.rng)
		if err != nil {
			t.Fatal(err)
		}
		if p.Counts.RecurringAsRule != 0 || p.Counts.NeedsReview != 1 || p.ReviewItems[0].Recurrence != nil || p.Counts.AlreadyImported != 1 {
			t.Errorf("2 回目のプレビューの件数 = %+v", p.Counts)
		}
		res, err = e.importDecided(t, e.rng, []calendarimport.Decision{{ExternalEventID: "series", Action: calendarimport.ActionPatient, PatientID: "PB1"}})
		if err != nil {
			t.Fatal(err)
		}
		if res.Run.ImportedCount != 4 || res.AlreadyImported != 1 {
			t.Errorf("2 回目 = %+v, AlreadyImported = %d", res.Run, res.AlreadyImported)
		}
		if len(e.store.Recurring) != 1 {
			t.Errorf("繰り返しの予定を作った: %d 件（Seeded の 1 件だけのはず）", len(e.store.Recurring))
		}
		var on1116 int
		for _, s := range e.store.Schedules {
			if s.Date == (civil.Date{Year: 2026, Month: 11, Day: 16}) {
				on1116++
			}
		}
		if on1116 != 1 {
			t.Errorf("11-16 の予定 = %d 件, want 1", on1116)
		}
	})
}

func TestImportIgnoresStaleRun(t *testing.T) {
	e := newEnv(t, fixture())
	e.store.Runs["STALE"] = calendar.ImportRun{ID: "STALE", ExternalCalendarID: calID, Status: calendar.RunRunning, StartedAt: time.Now().Add(-11 * time.Minute)}
	if _, err := e.importDecided(t, e.rng, decisions()); err != nil {
		t.Fatalf("10 分より前の running があるとき: err = %v", err)
	}
}

func TestImportMovedOutOfRange(t *testing.T) {
	srv := &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {{
		grecurring(gevent("weekly", "【訪看I2】利用者A", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00"),
			"RRULE:FREQ=WEEKLY;BYDAY=MO"),
		// 11-30 の回を 12-02 に動かした
		gexception("weekly_1130", "weekly", "【訪看I2】利用者A", "2026-12-02T09:00:00+09:00", "2026-12-02T09:30:00+09:00", "2026-11-30T09:00:00+09:00"),
	}}}}
	e := newEnv(t, nil)
	e.uc = withSource(e, startFiltered{gcal.NewReader(gcaltest.Start(t, srv))})

	if _, err := e.importDecided(t, e.rng, nil); err != nil {
		t.Fatal(err)
	}
	rs := recurringOf(t, e, "weekly")
	if !slices.Contains(rs.ExclusionDates, civil.Date{Year: 2026, Month: 11, Day: 30}) {
		t.Errorf("除外の日 = %v, want 期間の外へ動かした 11-30 を含む", rs.ExclusionDates)
	}
	if moved := scheduleOf(t, e, "weekly_1130"); moved.Date != (civil.Date{Year: 2026, Month: 12, Day: 2}) || moved.RecurringScheduleID == nil {
		t.Errorf("動かした回 = %+v", moved)
	}
}

func TestImportExpandedMovedOutOfRange(t *testing.T) {
	srv := &gcaltest.Server{
		Calendars: map[string][][]*calendarv3.Event{googleCalID: {{
			grecurring(gevent("biweekly", "定例", "2026-11-03T16:00:00+09:00", "2026-11-03T17:00:00+09:00"),
				"RRULE:FREQ=WEEKLY;INTERVAL=2"),
			// 11-17 の回を 12-01 に動かした。Instances は今の日時で絞るので、期間の 11 月には返らない
			gexception("biweekly_1117", "biweekly", "定例", "2026-12-01T16:00:00+09:00", "2026-12-01T17:00:00+09:00", "2026-11-17T16:00:00+09:00"),
		}}},
		Instances: map[string][]*calendarv3.Event{"biweekly": {
			gexception("biweekly_1103", "biweekly", "定例", "2026-11-03T16:00:00+09:00", "2026-11-03T17:00:00+09:00", "2026-11-03T16:00:00+09:00"),
		}},
	}
	e := newEnv(t, srv)
	e.uc = withSource(e, startFiltered{gcal.NewReader(gcaltest.Start(t, srv))})
	p, err := e.uc.Preview(e.ctx, calID, e.rng)
	if err != nil {
		t.Fatal(err)
	}
	if p.Counts.Recurring != 1 || p.Counts.RecurringExpanded != 1 || p.Counts.ExpandedOccurrences != 2 {
		t.Errorf("プレビューの件数 = %+v", p.Counts)
	}
	res, err := e.importDecided(t, e.rng, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Run.ImportedCount != 2 {
		t.Errorf("Run = %+v, want 11-03 の回と 12-01 に動かした回の 2 件", res.Run)
	}
	if moved := scheduleOf(t, e, "biweekly_1117"); moved.Date != (civil.Date{Year: 2026, Month: 12, Day: 1}) {
		t.Errorf("動かした回 = %+v", moved)
	}
}

func TestImportExcludesSkippedReplacement(t *testing.T) {
	series := func(summary string) *gcaltest.Server {
		return &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {{
			grecurring(gevent("weekly", "【訪看I2】利用者A", "2026-11-02T09:00:00+09:00", "2026-11-02T09:30:00+09:00"),
				"RRULE:FREQ=WEEKLY;BYDAY=MO"),
			gexception("weekly_1109", "weekly", summary, "2026-11-09T10:00:00+09:00", "2026-11-09T10:30:00+09:00", "2026-11-09T09:00:00+09:00"),
		}}}}
	}
	nov9 := civil.Date{Year: 2026, Month: 11, Day: 9}
	t.Run("サービスコードを引けない置き換え", func(t *testing.T) {
		e := newEnv(t, series("【謎】利用者A"))
		if _, err := e.importDecided(t, e.rng, nil); err != nil {
			t.Fatal(err)
		}
		if rs := recurringOf(t, e, "weekly"); !slices.Contains(rs.ExclusionDates, nov9) {
			t.Errorf("除外の日 = %v, want 11-09 を含む", rs.ExclusionDates)
		}
	})
	t.Run("取り込まないを選んだ置き換え", func(t *testing.T) {
		e := newEnv(t, series("【訪看I2】利用者Z"))
		if _, err := e.importDecided(t, e.rng, []calendarimport.Decision{{ExternalEventID: "weekly_1109", Action: calendarimport.ActionSkip}}); err != nil {
			t.Fatal(err)
		}
		if rs := recurringOf(t, e, "weekly"); !slices.Contains(rs.ExclusionDates, nov9) {
			t.Errorf("除外の日 = %v, want 11-09 を含む", rs.ExclusionDates)
		}
	})
}

// TestImportOvernight は、翌日に終わる 24 時間未満の予定を、終了が翌日の予定として取り込み、2 日にわたる予定を取り込まないことを確認する（ADR-0023）。
// 繰り返しの予定は親の予定の印で取り込み、親と印が違う変えた回は、その回の印を持つ置き換えにする。
func TestImportOvernight(t *testing.T) {
	e := newEnv(t, &gcaltest.Server{Calendars: map[string][][]*calendarv3.Event{googleCalID: {{
		gevent("night", "【訪看I2】利用者A", "2026-11-02T22:00:00+09:00", "2026-11-03T01:00:00+09:00"),
		gevent("midnight", "【訪看I2】利用者Z", "2026-11-03T22:00:00+09:00", "2026-11-04T00:00:00+09:00"),
		gevent("nocode", "【謎のサービス】利用者A", "2026-11-04T23:00:00+09:00", "2026-11-05T02:00:00+09:00"),
		gevent("twodays", "研修", "2026-11-05T09:00:00+09:00", "2026-11-06T17:00:00+09:00"),
		// 毎週火曜の 22 時から翌 1 時の繰り返し。11-17 を、日をまたがない 20 時から 21 時に変えた。
		grecurring(gevent("weekly", "夜勤", "2026-11-10T22:00:00+09:00", "2026-11-11T01:00:00+09:00"), "RRULE:FREQ=WEEKLY;BYDAY=TU"),
		gexception("weekly_20261117", "weekly", "夜勤", "2026-11-17T20:00:00+09:00", "2026-11-17T21:00:00+09:00", "2026-11-17T22:00:00+09:00"),
	}}}})
	p, err := e.uc.Preview(e.ctx, calID, e.rng)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.ReviewItems) != 1 || !p.ReviewItems[0].EndsNextDay || p.ReviewItems[0].EndTime != (civil.Time{}) {
		t.Errorf("確認が必要な予定 = %+v", p.ReviewItems)
	}
	if len(p.SkippedItems) != 2 {
		t.Fatalf("取り込まない予定 = %+v", p.SkippedItems)
	}
	if s := p.SkippedItems[0]; s.Reason != calendarimport.SkipServiceNotFound || !s.EndsNextDay || s.StartTime == nil || *s.EndTime != (civil.Time{Hour: 2}) {
		t.Errorf("サービス内容を引けない予定 = %+v", s)
	}
	if s := p.SkippedItems[1]; s.Reason != calendar.SkipMultiDay || s.EndsNextDay {
		t.Errorf("2 日にわたる予定 = %+v", s)
	}

	if _, err := e.importDecided(t, e.rng, []calendarimport.Decision{{ExternalEventID: "midnight", Action: calendarimport.ActionNormal}}); err != nil {
		t.Fatal(err)
	}
	nov := func(d int) civil.Date { return civil.Date{Year: 2026, Month: 11, Day: d} }
	if s := scheduleOf(t, e, "night"); s.Date != nov(2) || s.StartTime != (civil.Time{Hour: 22}) || s.EndTime != (civil.Time{Hour: 1}) || !s.EndsNextDay {
		t.Errorf("22 時から翌 1 時の予定 = %+v", s.Slot)
	}
	if s := scheduleOf(t, e, "midnight"); s.Date != nov(3) || s.EndTime != (civil.Time{}) || !s.EndsNextDay {
		t.Errorf("翌 0 時に終わる予定 = %+v", s.Slot)
	}
	if rs := recurringOf(t, e, "weekly"); rs.Date != nov(10) || !rs.EndsNextDay || !slices.Equal(rs.ExclusionDates, []civil.Date{nov(17)}) {
		t.Errorf("繰り返しの予定 = %+v, 除外の日 %v", rs.Slot, rs.ExclusionDates)
	}
	if s := scheduleOf(t, e, "weekly_20261117"); s.Date != nov(17) || s.StartTime != (civil.Time{Hour: 20}) || s.EndsNextDay || s.OriginalDate == nil {
		t.Errorf("日をまたがない回の置き換え = %+v", s)
	}
}
