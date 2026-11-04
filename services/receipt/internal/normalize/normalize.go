// Package normalize は、データソースが詰めた正規化の前の値（record.Fields）を、予定と実績で比べられる Record にする。
package normalize

import (
	"strconv"
	"strings"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"
	"github.com/Fukuemon/buddy/packages/go/servicecode"

	"github.com/Fukuemon/buddy/services/receipt/internal/civil"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
	"github.com/Fukuemon/buddy/services/receipt/internal/servicerule"
)

// staff は、主訪問者の全角スペースを半角にする。
func staff(s string) string {
	return strings.ReplaceAll(s, "　", " ")
}

// Schedules は、予定の行の値を Record にする。誤りのある行は Record にせず、項目ごとの record.CSVError で返す。
// 終了時間と提供時間から 1 分引くサービス内容（servicerule.HasScheduleEndAdjustment）の行は、引いた値にする。
// 終了時間は開始時間と違うときだけ、提供時間は 1 以上のときだけ引く。
// 翌日に終わる行も引く。翌日の 0:00 に終わる行は、終了時間を開始の日の 23:59 にする。
func Schedules(rows []record.Fields) ([]record.Record, []record.CSVError) {
	recs, errs := toRecords(rows, record.InputSchedule, false)
	for i := range recs {
		if !servicerule.HasScheduleEndAdjustment(recs[i].Service) {
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

// Visits は、実績の行の値を Record にする。加算は空でない値だけを残す。誤りのある行は Record にせず、項目ごとの record.CSVError で返す。
// 予定と実績のどちらも、終了時間が開始時間より前の行は、訪問日の翌日のその時刻に終わる訪問として読む（ADR-0023）。
func Visits(rows []record.Fields) ([]record.Record, []record.CSVError) {
	return toRecords(rows, record.InputVisit, true)
}

func toRecords(rows []record.Fields, input record.Input, readsAdditions bool) ([]record.Record, []record.CSVError) {
	var (
		recs []record.Record
		errs []record.CSVError
	)
	for _, row := range rows {
		rec, rowErrs := toRecord(row, input, readsAdditions)
		if len(rowErrs) > 0 {
			errs = append(errs, rowErrs...)
			continue
		}
		recs = append(recs, rec)
	}
	return recs, errs
}

func toRecord(row record.Fields, input record.Input, readsAdditions bool) (record.Record, []record.CSVError) {
	var errs []record.CSVError
	fail := func(column string, reason record.Reason, message string) {
		errs = append(errs, record.CSVError{Input: input, Reason: reason, Line: row.Line, Column: column, Message: message})
	}

	rec := record.Record{Line: row.Line}

	date, err := civil.ParseDate(row.Date)
	if err != nil {
		fail(record.ColumnDate, record.ReasonInvalidDate, err.Error())
	}
	rec.Key = record.Key{
		Date:   date,
		Client: gcaltitle.NormalizeClient(row.Client),
		Staff:  staff(row.Staff),
	}
	if rec.Key.Client == "" {
		fail(record.ColumnClient, record.ReasonEmptyValue, "空である")
	}
	if strings.TrimSpace(rec.Key.Staff) == "" {
		fail(record.ColumnStaff, record.ReasonEmptyValue, "空である")
	}

	rec.Service = servicecode.Normalize(row.Service)
	if strings.TrimSpace(rec.Service) == "" {
		fail(record.ColumnService, record.ReasonEmptyValue, "空である")
	}

	start, errStart := civil.ParseClock(row.Start)
	if errStart != nil {
		fail(record.ColumnStart, record.ReasonInvalidTime, errStart.Error())
	}
	end, errEnd := civil.ParseClock(row.End)
	if errEnd != nil {
		fail(record.ColumnEnd, record.ReasonInvalidTime, errEnd.Error())
	}
	rec.Start, rec.End = start, end

	if v := strings.TrimSpace(row.Duration); v != "" {
		d, err := strconv.Atoi(v)
		if err != nil || d < 0 {
			fail(record.ColumnDuration, record.ReasonInvalidDuration, "0 以上の整数でない: "+strconv.Quote(v))
		}
		rec.Duration = &d
	}

	if readsAdditions {
		rec.Additions = []string{}
		for _, v := range row.Additions {
			if v != "" {
				rec.Additions = append(rec.Additions, v)
			}
		}
	}
	return rec, errs
}
