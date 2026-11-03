// Package normalize は、CSV の行を、予定と実績で比べられる Record にする。
package normalize

import (
	"strconv"
	"strings"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/services/receipt/internal/civil"
	"github.com/Fukuemon/buddy/services/receipt/internal/csvio"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
	"github.com/Fukuemon/buddy/services/receipt/internal/servicerule"
)

// Staff は、主訪問者の全角スペースを半角にする。
func Staff(s string) string {
	return strings.ReplaceAll(s, "　", " ")
}

// Schedules は、予定の行を Record にする。
// 終了時間と提供時間から 1 分引くサービス内容（servicerule.AdjustsScheduleEnd）の行は、引いた値にする。
// 終了時間は開始時間と違うときだけ、提供時間は 1 以上のときだけ引く。
// 翌日に終わる行も引く。翌日の 0:00 に終わる行は、終了時間を開始の日の 23:59 にする。
func Schedules(rows []csvio.Row) ([]record.Record, []record.CSVError) {
	recs, errs := convert(rows, record.InputSchedule, false)
	for i := range recs {
		if !servicerule.AdjustsScheduleEnd(recs[i].Service) {
			continue
		}
		if recs[i].End != recs[i].Start {
			recs[i].End = recs[i].End.AddMinutes(-1)
		}
		if recs[i].Duration != nil && *recs[i].Duration >= 1 {
			d := *recs[i].Duration - 1
			recs[i].Duration = &d
		}
	}
	return recs, errs
}

// Visits は、実績の行を Record にする。
// 予定と実績のどちらも、終了時間が開始時間より前の行は、訪問日の翌日のその時刻に終わる訪問として読む（ADR-0023）。
func Visits(rows []csvio.Row) ([]record.Record, []record.CSVError) {
	return convert(rows, record.InputVisit, true)
}

func convert(rows []csvio.Row, input record.Input, withAdditions bool) ([]record.Record, []record.CSVError) {
	var (
		recs []record.Record
		errs []record.CSVError
	)
	for _, row := range rows {
		rec, rowErrs := convertRow(row, input, withAdditions)
		if len(rowErrs) > 0 {
			errs = append(errs, rowErrs...)
			continue
		}
		recs = append(recs, rec)
	}
	return recs, errs
}

func convertRow(row csvio.Row, input record.Input, withAdditions bool) (record.Record, []record.CSVError) {
	var errs []record.CSVError
	fail := func(column string, reason record.Reason, message string) {
		errs = append(errs, record.CSVError{Input: input, Reason: reason, Line: row.Line, Column: column, Message: message})
	}

	rec := record.Record{Line: row.Line}

	date, err := civil.ParseDate(row.Get(csvio.ColDate))
	if err != nil {
		fail(csvio.ColDate, record.ReasonInvalidDate, err.Error())
	}
	rec.Key = record.Key{
		Date:   date,
		Client: gcaltitle.NormalizeClient(row.Get(csvio.ColClient)),
		Staff:  Staff(row.Get(csvio.ColStaff)),
	}
	if rec.Key.Client == "" {
		fail(csvio.ColClient, record.ReasonEmptyValue, "空である")
	}
	if strings.TrimSpace(rec.Key.Staff) == "" {
		fail(csvio.ColStaff, record.ReasonEmptyValue, "空である")
	}

	rec.Service = gcaltitle.NormalizeService(row.Get(csvio.ColService))
	if strings.TrimSpace(rec.Service) == "" {
		fail(csvio.ColService, record.ReasonEmptyValue, "空である")
	}

	start, errStart := civil.ParseClock(row.Get(csvio.ColStart))
	if errStart != nil {
		fail(csvio.ColStart, record.ReasonInvalidTime, errStart.Error())
	}
	end, errEnd := civil.ParseClock(row.Get(csvio.ColEnd))
	if errEnd != nil {
		fail(csvio.ColEnd, record.ReasonInvalidTime, errEnd.Error())
	}
	rec.Start, rec.End = start, end

	if v := strings.TrimSpace(row.Get(csvio.ColDuration)); v != "" {
		d, err := strconv.Atoi(v)
		if err != nil || d < 0 {
			fail(csvio.ColDuration, record.ReasonInvalidDuration, "0 以上の整数でない: "+strconv.Quote(v))
		}
		rec.Duration = &d
	}

	if withAdditions {
		rec.Additions = []string{}
		for _, c := range csvio.AdditionColumns() {
			if v := row.Get(c); v != "" {
				rec.Additions = append(rec.Additions, v)
			}
		}
	}
	return rec, errs
}
