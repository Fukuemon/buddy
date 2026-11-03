// Package check は、実績の CSV と予定のデータソースから照合の結果を作る。
package check

import (
	"context"
	"errors"
	"strings"

	"github.com/Fukuemon/buddy/services/receipt/internal/csvio"
	"github.com/Fukuemon/buddy/services/receipt/internal/judge"
	"github.com/Fukuemon/buddy/services/receipt/internal/match"
	"github.com/Fukuemon/buddy/services/receipt/internal/normalize"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

// ScheduleSource は、照合に使う予定を返す。返す Record は normalize.Schedules を通した後の値である。
// 照合に使わなかった予定は record.Warning で返す。
// 入力のエラーは *record.InputError で、データソースから予定を取れないときは *SourceError で返す。
type ScheduleSource interface {
	Schedules(ctx context.Context) ([]record.Record, []record.Warning, error)
}

// SourceError は、予定のデータソースから予定を取れないことを表す。入力のエラーではない。
type SourceError struct {
	Message string
	Err     error
}

func (e *SourceError) Error() string {
	return e.Message + ": " + e.Err.Error()
}

func (e *SourceError) Unwrap() error {
	return e.Err
}

// CSVSchedules は、予定の CSV から予定を読む ScheduleSource である。
type CSVSchedules struct {
	Data []byte
}

// Schedules は、Data を予定の CSV として読む。警告は返さない。
func (s CSVSchedules) Schedules(_ context.Context) ([]record.Record, []record.Warning, error) {
	rows, err := csvio.ReadTable(s.Data, record.InputSchedule, csvio.ScheduleColumns())
	if err != nil {
		return nil, nil, err
	}
	recs, rowErrs := normalize.Schedules(rows)
	if len(rowErrs) > 0 {
		return nil, nil, &record.InputError{Message: "予定の CSV に誤りがある", Errors: rowErrs}
	}
	return recs, nil, nil
}

// Summary は、区分ごとの行の数である。
type Summary struct {
	Mismatch     int
	ScheduleOnly int
	VisitOnly    int
	Match        int
}

// Report は、照合の結果である。Rows は judge.All の順に並ぶ。
type Report struct {
	Summary Summary
	Rows    []judge.Result
	// Warnings は、予定のデータソースが照合に使わなかった予定である。無ければ空の配列である。
	Warnings []record.Warning
}

// Run は、実績の CSV の visits と、schedules の予定を照合する。
// 実績と予定のどちらかに入力のエラーがあれば、両方のエラーをまとめた *record.InputError を返す。
// 予定のデータソースのそのほかのエラー（*SourceError など）は、そのまま返す。
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
	scheduleRecs, warnings, err := schedules.Schedules(ctx)
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
			merged.Errors = append(merged.Errors, ie.Errors...)
		}
		merged.Message = strings.Join(msgs, "。")
		return Report{}, merged
	}

	results := judge.All(match.Pairs(scheduleRecs, visitRecs))
	rep := Report{Rows: results, Warnings: warnings}
	if rep.Warnings == nil {
		rep.Warnings = []record.Warning{}
	}
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
	rows, err := csvio.ReadTable(data, record.InputVisit, csvio.VisitColumns())
	if err != nil {
		return nil, err
	}
	recs, rowErrs := normalize.Visits(rows)
	if len(rowErrs) > 0 {
		return nil, &record.InputError{Message: "実績の CSV に誤りがある", Errors: rowErrs}
	}
	return recs, nil
}
