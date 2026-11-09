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

// Run は、実績の CSV の visits と、schedules の予定を照合する。
// 実績と予定のどちらかに入力のエラーがあれば、両方のエラーをまとめた *record.InputError を返す。
// 予定のデータソースのそのほかのエラー（*SourceError など）は、そのまま返す。
func Run(ctx context.Context, visits []byte, schedules ScheduleSource) (Report, error) {
	var inputErrs []*record.InputError
	// collect は、入力のエラーを inputErrs に集め、そのほかのエラーを返す。
	collect := func(err error) error {
		if err == nil {
			return nil
		}
		ie, ok := errors.AsType[*record.InputError](err)
		if !ok {
			return err
		}
		inputErrs = append(inputErrs, ie)
		return nil
	}

	visitRecs, err := readCSV(visits, record.InputVisit, csvio.VisitColumns(), normalize.Visits, "実績の CSV に誤りがある")
	if err := collect(err); err != nil {
		return Report{}, err
	}
	scheduleRecs, warnings, err := schedules.Schedules(ctx)
	if err := collect(err); err != nil {
		return Report{}, err
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

// readCSV は、data を input の CSV として columns の列で読み、normalizeRows で正規化する。
// 読めないときと正規化できない行があるときは、*record.InputError を返す。行の誤りの Message は message にする。
func readCSV(
	data []byte,
	input record.Input,
	columns []string,
	normalizeRows func([]record.Fields) ([]record.Record, []record.CSVError),
	message string,
) ([]record.Record, error) {
	rows, err := csvio.ReadTable(data, input, columns)
	if err != nil {
		return nil, err
	}
	fields := make([]record.Fields, len(rows))
	for i, r := range rows {
		fields[i] = r.Fields()
	}
	recs, rowErrs := normalizeRows(fields)
	if len(rowErrs) > 0 {
		return nil, &record.InputError{Message: message, Errors: rowErrs}
	}
	return recs, nil
}
