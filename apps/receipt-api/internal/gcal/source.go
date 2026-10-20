package gcal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // 配布のイメージ（distroless）にタイムゾーンのデータが無くても Asia/Tokyo を読むため。

	"google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/check"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/csvio"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/normalize"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
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
	// StaffName は主訪問者の名前である。空なら、カレンダーの表示名を主訪問者にする。
	StaffName string `json:"staff_name,omitempty"`
}

// LoadCalendars は、照合の対象のカレンダーの一覧を JSON のファイルから読む。
// 形は [{"calendar_id": "...", "staff_name": "..."}] である。
// 一覧が空、calendar_id が空か重なる、知らないキーがある、のいずれかではエラーを返す。
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
		if seen[c.ID] {
			return nil, fmt.Errorf("カレンダーの設定 %s の calendar_id %s が重なっている", path, c.ID)
		}
		seen[c.ID] = true
	}
	return cals, nil
}

// Month は、照合の対象の月である。
type Month struct {
	Year  int
	Month time.Month
}

// ParseMonth は、`2024-04` の形を読む。
func ParseMonth(s string) (Month, error) {
	t, err := time.Parse("2006-01", s)
	if err != nil || len(s) != len("2006-01") {
		return Month{}, fmt.Errorf("対象の月の形が違う。YYYY-MM にする: %q", s)
	}
	return Month{Year: t.Year(), Month: t.Month()}, nil
}

// String は、`2024-04` の形で返す。
func (m Month) String() string {
	return fmt.Sprintf("%04d-%02d", m.Year, int(m.Month))
}

// Reader は、Calendar API で、設定したカレンダーの予定を読む。
type Reader struct {
	svc       *calendar.Service
	calendars []Calendar
}

// NewReader は、svc で calendars の予定を読む Reader を返す。
// svc の認証は呼び出す側が決める。予定を読むには calendar.readonly のスコープが要る。
func NewReader(svc *calendar.Service, calendars []Calendar) *Reader {
	return &Reader{svc: svc, calendars: calendars}
}

// Month は、month の 1 日 00:00 から月末 24:00（Asia/Tokyo）に始まる予定を返す check.ScheduleSource である。
func (r *Reader) Month(month Month) check.ScheduleSource {
	start := time.Date(month.Year, month.Month, 1, 0, 0, 0, 0, tokyo)
	return monthSource{reader: r, start: start, end: start.AddDate(0, 1, 0)}
}

type monthSource struct {
	reader     *Reader
	start, end time.Time
}

// Schedules は、カレンダーごとに予定を読み、訪問の予定を Record にする。
// 終日の予定、取り消された予定、題名に `【` と `】` の両方を含まない予定は除く。
// 題名や時刻を解釈できない予定は、照合に混ぜずに record.Warning で返す。
// Calendar API の呼び出しに失敗すると、*check.SourceError を返す。
func (s monthSource) Schedules(ctx context.Context) ([]record.Record, []record.Warning, error) {
	var (
		recs  []record.Record
		warns []record.Warning
	)
	for _, cal := range s.reader.calendars {
		staff := cal.StaffName
		err := s.reader.svc.Events.List(cal.ID).
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
					rec, ok, msg := s.convert(ev, staff)
					if msg != "" {
						warns = append(warns, record.Warning{
							CalendarID: cal.ID, EventID: ev.Id, Start: ev.Start.DateTime, Message: msg,
						})
					}
					if ok {
						recs = append(recs, rec)
					}
				}
				return nil
			})
		if err != nil {
			return nil, nil, &check.SourceError{
				Message: fmt.Sprintf("カレンダー %s の予定を取れない", cal.ID),
				Err:     err,
			}
		}
	}
	return recs, warns, nil
}

// convert は、予定を Record にする。照合に使わない予定では ok が false になる。
// 解釈できずに除いた予定では、warning に理由を返す。
func (s monthSource) convert(ev *calendar.Event, staff string) (rec record.Record, ok bool, warning string) {
	if ev.Status == "cancelled" || ev.Start == nil || ev.End == nil || ev.Start.DateTime == "" {
		return record.Record{}, false, ""
	}
	if !IsVisitTitle(ev.Summary) {
		return record.Record{}, false, ""
	}
	start, err := time.Parse(time.RFC3339, ev.Start.DateTime)
	if err != nil {
		return record.Record{}, false, "開始の日時を読めない"
	}
	end, err := time.Parse(time.RFC3339, ev.End.DateTime)
	if err != nil {
		return record.Record{}, false, "終了の日時を読めない"
	}
	start, end = start.In(tokyo), end.In(tokyo)
	if start.Before(s.start) || !start.Before(s.end) {
		return record.Record{}, false, ""
	}
	service, client, err := ParseTitle(ev.Summary)
	if err != nil {
		return record.Record{}, false, err.Error()
	}
	if start.Format(time.DateOnly) != end.Format(time.DateOnly) {
		return record.Record{}, false, "日付をまたぐ予定は扱わない"
	}

	row := csvio.NewRow(0, map[string]string{
		csvio.ColDate:     start.Format(time.DateOnly),
		csvio.ColClient:   client,
		csvio.ColStart:    start.Format("15:04"),
		csvio.ColEnd:      end.Format("15:04"),
		csvio.ColDuration: strconv.FormatFloat(end.Sub(start).Minutes(), 'f', -1, 64),
		csvio.ColService:  service,
		csvio.ColStaff:    staff,
	})
	recs, rowErrs := normalize.Schedules([]csvio.Row{row})
	if len(rowErrs) > 0 {
		msgs := make([]string, len(rowErrs))
		for i, e := range rowErrs {
			msgs[i] = e.Column + ": " + e.Message
		}
		return record.Record{}, false, strings.Join(msgs, "。")
	}
	return recs[0], true, ""
}
