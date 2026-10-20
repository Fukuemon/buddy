// Package normalize は、CSV の行を、予定と実績で比べられる Record にする。
package normalize

import (
	"strconv"
	"strings"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/civil"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/csvio"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/servicerule"
)

// Service は、サービス内容の表記をそろえる。
// 全角スペースを半角にし、`Ⅰ` `１` `1` を `I` に、`･` を `・` に、残った半角数字を全角にする。
func Service(s string) string {
	s = strings.ReplaceAll(s, "　", " ")
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == 'Ⅰ' || r == '１' || r == '1':
			b.WriteRune('I')
		case r == '･':
			b.WriteRune('・')
		case '0' <= r && r <= '9':
			b.WriteRune(r - '0' + '０')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Client は、利用者名の全角と半角のスペースを除く。
func Client(s string) string {
	return strings.ReplaceAll(Staff(s), " ", "")
}

// Staff は、主訪問者の全角スペースを半角にする。
func Staff(s string) string {
	return strings.ReplaceAll(s, "　", " ")
}

// Schedules は、予定の行を Record にする。
// 終了時間と提供時間から 1 分引くサービス内容（servicerule.AdjustsScheduleEnd）の行は、引いた値にする。
func Schedules(rows []csvio.Row) ([]record.Record, []record.RowError) {
	recs, errs := convert(rows, record.SourceSchedule, false)
	for i := range recs {
		if !servicerule.AdjustsScheduleEnd(recs[i].Service) {
			continue
		}
		recs[i].End--
		if recs[i].Duration != nil {
			d := *recs[i].Duration - 1
			recs[i].Duration = &d
		}
	}
	return recs, errs
}

// Visits は、実績の行を Record にする。
func Visits(rows []csvio.Row) ([]record.Record, []record.RowError) {
	return convert(rows, record.SourceVisit, true)
}

func convert(rows []csvio.Row, source record.Source, withAdditions bool) ([]record.Record, []record.RowError) {
	var (
		recs []record.Record
		errs []record.RowError
	)
	for _, row := range rows {
		rec, rowErrs := convertRow(row, source, withAdditions)
		if len(rowErrs) > 0 {
			errs = append(errs, rowErrs...)
			continue
		}
		recs = append(recs, rec)
	}
	return recs, errs
}

func convertRow(row csvio.Row, source record.Source, withAdditions bool) (record.Record, []record.RowError) {
	var errs []record.RowError
	fail := func(column, message string) {
		errs = append(errs, record.RowError{Source: source, Line: row.Line, Column: column, Message: message})
	}

	rec := record.Record{Line: row.Line}

	date, err := civil.ParseDate(row.Get(csvio.ColDate))
	if err != nil {
		fail(csvio.ColDate, err.Error())
	}
	rec.Key = record.Key{
		Date:   date,
		Client: Client(row.Get(csvio.ColClient)),
		Staff:  Staff(row.Get(csvio.ColStaff)),
	}
	if rec.Key.Client == "" {
		fail(csvio.ColClient, "空である")
	}
	if strings.TrimSpace(rec.Key.Staff) == "" {
		fail(csvio.ColStaff, "空である")
	}

	rec.Service = Service(row.Get(csvio.ColService))
	if strings.TrimSpace(rec.Service) == "" {
		fail(csvio.ColService, "空である")
	}

	start, errStart := civil.ParseClock(row.Get(csvio.ColStart))
	if errStart != nil {
		fail(csvio.ColStart, errStart.Error())
	}
	end, errEnd := civil.ParseClock(row.Get(csvio.ColEnd))
	if errEnd != nil {
		fail(csvio.ColEnd, errEnd.Error())
	}
	if errStart == nil && errEnd == nil && end < start {
		fail(csvio.ColEnd, "終了時間が開始時間より前である。日付をまたぐ訪問は扱わない")
	}
	rec.Start, rec.End = start, end

	if v := strings.TrimSpace(row.Get(csvio.ColDuration)); v != "" {
		d, err := strconv.Atoi(v)
		if err != nil || d < 0 {
			fail(csvio.ColDuration, "0 以上の整数でない: "+strconv.Quote(v))
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
