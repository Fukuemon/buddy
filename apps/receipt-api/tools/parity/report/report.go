// Package report は、照合の結果を、元の Python のツールと同じ記号つきの CSV に書く。
// Python の結果と比べるためだけに使う。API は記号を付けない。
package report

import (
	"encoding/csv"
	"io"
	"strconv"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/judge"
)

const (
	utf8BOM  = "\xEF\xBB\xBF"
	noData   = "データなし"
	ngMark   = " ❌"
	noteMark = " ※"
)

// Header は、結果の CSV のヘッダーを返す。
func Header() []string {
	return []string{
		"訪問日", "利用者名", "主訪問者",
		"サービス内容_予定", "開始時間_予定", "終了時間_予定", "提供時間_予定",
		"サービス内容_実績", "開始時間_実績", "終了時間_実績", "提供時間_実績",
		"加算",
	}
}

// CategoryLabel は、区分の区切りの行に書く名前を返す。
func CategoryLabel(c judge.Category) string {
	switch c {
	case judge.Mismatch:
		return "不整合データ"
	case judge.ScheduleOnly:
		return "予定のみ"
	case judge.VisitOnly:
		return "実績のみ"
	default:
		return "整合データ"
	}
}

// Write は、結果を BOM 付きの UTF-8 の CSV で w に書く。
// 区分ごとに、訪問日のカラムに区分の名前を、ほかのカラムに `---` を書いた区切りの行を置く。
// 不整合のセルには ` ❌` を、許容範囲を外れたセルにはさらに `(20~29)` の形の範囲を付ける。
// 整合の行で提供時間か終了時間の値が両側で違うときは ` ※` を付ける。加算が `通常` でないときも ` ※` を付ける。
func Write(w io.Writer, results []judge.Result) error {
	if _, err := io.WriteString(w, utf8BOM); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	header := Header()
	if err := cw.Write(header); err != nil {
		return err
	}
	byCategory := map[judge.Category][]judge.Result{}
	for _, r := range results {
		byCategory[r.Category] = append(byCategory[r.Category], r)
	}
	for _, c := range judge.Categories() {
		boundary := make([]string, len(header))
		boundary[0] = CategoryLabel(c)
		for i := 1; i < len(boundary); i++ {
			boundary[i] = "---"
		}
		if err := cw.Write(boundary); err != nil {
			return err
		}
		for _, r := range byCategory[c] {
			if err := cw.Write(reportRow(r)); err != nil {
				return err
			}
		}
	}
	cw.Flush()
	return cw.Error()
}

type sideCells struct {
	service, start, end, duration string
}

func reportRow(r judge.Result) []string {
	s := sideCells{noData, noData, noData, noData}
	v := s
	addition := noData
	if r.Schedule != nil {
		s = cells(*r.Schedule)
	}
	if r.Visit != nil {
		v = cells(*r.Visit)
		addition = *r.Visit.Additions
	}
	if c := r.Checks; c != nil {
		both := func(ok bool, a, b *string, mark string) {
			if !ok {
				*a += mark
				*b += mark
			}
		}
		switch r.Category {
		case judge.Mismatch:
			both(c.Start.OK, &s.start, &v.start, ngMark)
			both(c.DurationEqual, &s.duration, &v.duration, ngMark)
			both(c.Service.OK, &s.service, &v.service, ngMark)
			s.end += rangeMark(c.ScheduleElapsed)
			v.end += rangeMark(c.VisitElapsed)
			s.duration += rangeMark(c.ScheduleDuration)
			v.duration += rangeMark(c.VisitDuration)
			if !c.Additions.OK {
				addition += noteMark
			}
		case judge.Match:
			if !c.DurationEqual {
				s.duration += noteMark + " (" + c.ScheduleDuration.Range.String() + ")"
				v.duration += noteMark + " (" + c.VisitDuration.Range.String() + ")"
			}
			both(c.EndEqual, &s.end, &v.end, noteMark)
		}
	}
	return []string{
		r.Date.String(), r.Client, r.Staff,
		s.service, s.start, s.end, s.duration,
		v.service, v.start, v.end, v.duration,
		addition,
	}
}

func cells(side judge.Side) sideCells {
	d := noData
	if side.Duration != nil {
		d = strconv.Itoa(*side.Duration)
	}
	return sideCells{side.Service, side.Start.String(), side.End.String(), d}
}

func rangeMark(c judge.RangeCheck) string {
	if c.OK {
		return ""
	}
	if c.Range == nil {
		return ngMark
	}
	return ngMark + " (" + c.Range.String() + ")"
}
