// Package check は、実績の CSV と予定の取得元から照合の結果を作る。
package check

import (
	"context"
	"errors"
	"strings"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/csvio"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/judge"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/match"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/normalize"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
)

// ScheduleSource は、照合に使う予定を返す。返す Record は normalize.Schedules を通した後の値である。
// 入力の誤りは *record.InputError で返す。
type ScheduleSource interface {
	Schedules(ctx context.Context) ([]record.Record, error)
}

// CSVSchedules は、予定の CSV から予定を読む ScheduleSource である。
type CSVSchedules struct {
	Data []byte
}

// Schedules は、Data を予定の CSV として読む。
func (s CSVSchedules) Schedules(_ context.Context) ([]record.Record, error) {
	rows, err := csvio.ReadTable(s.Data, record.SourceSchedule, csvio.ScheduleColumns())
	if err != nil {
		return nil, err
	}
	recs, rowErrs := normalize.Schedules(rows)
	if len(rowErrs) > 0 {
		return nil, &record.InputError{Message: "予定の CSV に誤りがある", Rows: rowErrs}
	}
	return recs, nil
}

// Summary は、区分ごとの行の数である。
type Summary struct {
	Mismatch     int `json:"mismatch"`
	ScheduleOnly int `json:"schedule_only"`
	VisitOnly    int `json:"visit_only"`
	Match        int `json:"match"`
}

// Report は、照合の結果である。Rows は judge.All の順に並ぶ。
type Report struct {
	Summary Summary        `json:"summary"`
	Rows    []judge.Result `json:"rows"`
}

// Run は、実績の CSV の visits と、schedules の予定を照合する。
// 実績と予定のどちらかに入力の誤りがあれば、両方の誤りをまとめた *record.InputError を返す。
func Run(ctx context.Context, visits []byte, schedules ScheduleSource) (Report, error) {
	var inputErrs []*record.InputError

	visitRecs, err := readVisits(visits)
	if err != nil {
		var ie *record.InputError
		if !errors.As(err, &ie) {
			return Report{}, err
		}
		inputErrs = append(inputErrs, ie)
	}
	scheduleRecs, err := schedules.Schedules(ctx)
	if err != nil {
		var ie *record.InputError
		if !errors.As(err, &ie) {
			return Report{}, err
		}
		inputErrs = append(inputErrs, ie)
	}
	if len(inputErrs) > 0 {
		merged := &record.InputError{}
		var msgs []string
		for _, ie := range inputErrs {
			msgs = append(msgs, ie.Message)
			merged.Rows = append(merged.Rows, ie.Rows...)
		}
		merged.Message = strings.Join(msgs, "。")
		return Report{}, merged
	}

	results := judge.All(match.Pairs(scheduleRecs, visitRecs))
	rep := Report{Rows: results}
	for _, r := range results {
		switch r.Category {
		case judge.Mismatch:
			rep.Summary.Mismatch++
		case judge.ScheduleOnly:
			rep.Summary.ScheduleOnly++
		case judge.VisitOnly:
			rep.Summary.VisitOnly++
		case judge.Match:
			rep.Summary.Match++
		}
	}
	return rep, nil
}

func readVisits(data []byte) ([]record.Record, error) {
	rows, err := csvio.ReadTable(data, record.SourceVisit, csvio.VisitColumns())
	if err != nil {
		return nil, err
	}
	recs, rowErrs := normalize.Visits(rows)
	if len(rowErrs) > 0 {
		return nil, &record.InputError{Message: "実績の CSV に誤りがある", Rows: rowErrs}
	}
	return recs, nil
}
