// Package gcal は、Google カレンダーの予定を照合の予定として読む。
package gcal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // 配布のイメージ（distroless）にタイムゾーンのデータが無くても Asia/Tokyo を読むため。

	"google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/services/receipt/internal/check"
	"github.com/Fukuemon/buddy/services/receipt/internal/normalize"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

// TimeZone は、訪問日と時刻を決めるタイムゾーンである。
const TimeZone = "Asia/Tokyo"

var tokyo = mustLoadLocation(TimeZone)

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

// Calendar は、照合の対象のカレンダーである。
type Calendar struct {
	ID string `json:"calendar_id"`
	// OrgID は、カレンダーを使う事業所の、ID ブローカーの組織の ID である。この組織のトークンのリクエストだけが読む。
	OrgID string `json:"org_id"`
	// StaffName は主訪問者の名前である。空なら、カレンダーの表示名を主訪問者にする。
	StaffName string `json:"staff_name,omitempty"`
}

// LoadCalendars は、照合の対象のカレンダーの一覧を JSON のファイルから読む。
// 形は [{"calendar_id": "...", "org_id": "...", "staff_name": "..."}] である。
// 一覧が空、calendar_id が空か重なる、org_id が空、知らないキーがある、のいずれかではエラーを返す。
// エラーの文は、カレンダー ID（職員のメールアドレスのことがある）を含まない。
func LoadCalendars(path string) ([]Calendar, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	dec := json.NewDecoder(f)
	dec.DisallowUnknownFields()
	var cals []Calendar
	if err := dec.Decode(&cals); err != nil {
		return nil, fmt.Errorf("カレンダーの設定 %s を読めない: %w", path, err)
	}
	if len(cals) == 0 {
		return nil, fmt.Errorf("カレンダーの設定 %s が空である", path)
	}
	seen := make(map[string]bool, len(cals))
	for i, c := range cals {
		if strings.TrimSpace(c.ID) == "" {
			return nil, fmt.Errorf("カレンダーの設定 %s の %d 件目の calendar_id が空である", path, i+1)
		}
		if strings.TrimSpace(c.OrgID) == "" {
			return nil, fmt.Errorf("カレンダーの設定 %s の %d 件目の org_id が空である", path, i+1)
		}
		if seen[c.ID] {
			return nil, fmt.Errorf("カレンダーの設定 %s の %d 件目の calendar_id が前の件と重なっている", path, i+1)
		}
		seen[c.ID] = true
	}
	return cals, nil
}

// Services は、組織 orgID のサービスアカウントで Calendar API を呼ぶ calendar.Service を返す。実装は gcalauth.Clients である。
type Services interface {
	Service(orgID string) (*calendar.Service, error)
}

// Reader は、Calendar API で、設定したカレンダーの予定を、カレンダーの組織のサービスアカウントで読む（ADR-0029）。
type Reader struct {
	services  Services
	calendars []Calendar
}

// NewReader は、services が返す組織の calendar.Service で calendars の予定を読む Reader を返す。
// 認証は services が決める。予定を読むには calendar.readonly のスコープが要る。
func NewReader(services Services, calendars []Calendar) *Reader {
	return &Reader{services: services, calendars: calendars}
}

// Month は、組織 orgID のカレンダーから、year 年 month 月の 1 日 00:00 から月末 24:00（Asia/Tokyo）に始まる予定を、
// 組織 orgID のサービスアカウントで返す check.ScheduleSource である。orgID のカレンダーが無ければ false を返す。
func (r *Reader) Month(orgID string, year int, month time.Month) (check.ScheduleSource, bool) {
	var cals []Calendar
	for _, c := range r.calendars {
		if c.OrgID == orgID {
			cals = append(cals, c)
		}
	}
	if len(cals) == 0 {
		return nil, false
	}
	start := time.Date(year, month, 1, 0, 0, 0, 0, tokyo)
	return monthSource{services: r.services, orgID: orgID, calendars: cals, start: start, end: start.AddDate(0, 1, 0)}, true
}

type monthSource struct {
	services   Services
	orgID      string
	calendars  []Calendar
	start, end time.Time
}

// Schedules は、カレンダーごとに予定を読み、訪問の予定を Record にする。
// 終日の予定、取り消された予定、タイトルに `【` と `】` の両方を含まない予定は除く。
// タイトルや時刻を解釈できない予定は、照合に混ぜずに record.Warning で返す。
// 組織のサービスアカウントの設定が無いときと、Calendar API の呼び出しに失敗したときは、*check.SourceError を返す。
// エラーの文は、カレンダー ID（職員のメールアドレスのことがある）を含まない。
func (s monthSource) Schedules(ctx context.Context) ([]record.Record, []record.Warning, error) {
	svc, err := s.services.Service(s.orgID)
	if err != nil {
		return nil, nil, &check.SourceError{Message: "組織のサービスアカウントで Calendar API を呼べない", Err: err}
	}
	var (
		recs  []record.Record
		warns []record.Warning
	)
	for i, cal := range s.calendars {
		staff := cal.StaffName
		err := svc.Events.List(cal.ID).
			TimeMin(s.start.Format(time.RFC3339)).
			TimeMax(s.end.Format(time.RFC3339)).
			TimeZone(TimeZone).
			SingleEvents(true).
			OrderBy("startTime").
			ShowDeleted(false).
			MaxResults(2500).
			Pages(ctx, func(evs *calendar.Events) error {
				if staff == "" {
					staff = evs.Summary
				}
				for _, ev := range evs.Items {
					rec, ok, problem := s.toRecord(ev, staff)
					if problem != nil {
						problem.CalendarID, problem.EventID, problem.Start = cal.ID, ev.Id, ev.Start.DateTime
						warns = append(warns, *problem)
					}
					if ok {
						recs = append(recs, rec)
					}
				}
				return nil
			})
		if err != nil {
			// 通信のエラー（*url.Error）の文は、カレンダー ID を含むリクエストの URL を持つ。
			if uerr, ok := errors.AsType[*url.Error](err); ok {
				err = uerr.Err
			}
			return nil, nil, &check.SourceError{
				Message: fmt.Sprintf("組織の %d 件目のカレンダーの予定を取れない", i+1),
				Err:     err,
			}
		}
	}
	return recs, warns, nil
}

// toRecord は、予定を Record にする。照合に使わない予定では ok が false になる。
// 解釈できずに除いた予定では、problem に理由を返す。problem のカレンダーと予定と開始の日時は、呼ぶ側が埋める。
func (s monthSource) toRecord(ev *calendar.Event, staff string) (rec record.Record, ok bool, problem *record.Warning) {
	skip := func(reason record.Reason, column, message string) (record.Record, bool, *record.Warning) {
		return record.Record{}, false, &record.Warning{Reason: reason, Column: column, Message: message}
	}
	if ev.Status == "cancelled" || ev.Start == nil || ev.End == nil || ev.Start.DateTime == "" {
		return record.Record{}, false, nil
	}
	if !gcaltitle.IsVisitTitle(ev.Summary) {
		return record.Record{}, false, nil
	}
	start, err := time.Parse(time.RFC3339, ev.Start.DateTime)
	if err != nil {
		return skip(record.ReasonUnreadableTime, "", "開始の日時を読めない")
	}
	end, err := time.Parse(time.RFC3339, ev.End.DateTime)
	if err != nil {
		return skip(record.ReasonUnreadableTime, "", "終了の日時を読めない")
	}
	// 開始時間と終了時間は分までを使う。提供時間も秒を切り捨てた時刻の差にして、開始時間と終了時間の差に合わせる
	start, end = start.In(tokyo).Truncate(time.Minute), end.In(tokyo).Truncate(time.Minute)
	if start.Before(s.start) || !start.Before(s.end) {
		return record.Record{}, false, nil
	}
	service, client, err := gcaltitle.ParseTitle(ev.Summary)
	if err != nil {
		return skip(record.ReasonUnreadableTitle, "", err.Error())
	}
	if !isWithinNextDay(start, end) {
		return skip(record.ReasonSpansDays, "", "終了が開始の翌日より後か、24 時間以上の予定は扱わない")
	}

	recs, rowErrs := normalize.Schedules([]record.Fields{{
		Date:     start.Format(time.DateOnly),
		Client:   client,
		Start:    start.Format("15:04"),
		End:      end.Format("15:04"),
		Duration: strconv.Itoa(int(end.Sub(start) / time.Minute)),
		Service:  service,
		Staff:    staff,
	}})
	if len(rowErrs) > 0 {
		// 画面は 1 つの予定に 1 つの理由を出す。直して照合し直せば、残りの誤りも次の警告に出る
		e := rowErrs[0]
		return skip(e.Reason, e.Column, e.Column+": "+e.Message)
	}
	return recs[0], true, nil
}

// isWithinNextDay は、終了が開始と同じ日か、開始の翌日で 24 時間未満の予定かを返す（ADR-0032）。
// 翌日に終わる予定は、終了時間が開始時間より前の行として normalize が読む。
func isWithinNextDay(start, end time.Time) bool {
	switch end.Format(time.DateOnly) {
	case start.Format(time.DateOnly):
		return true
	case start.AddDate(0, 0, 1).Format(time.DateOnly):
		return end.Sub(start) < 24*time.Hour
	}
	return false
}
