package httpapi

import (
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/check"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/httpapi/openapi"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/judge"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
	"github.com/Fukuemon/buddy/apps/receipt-api/internal/servicerule"
)

func report(rep check.Report) openapi.Report {
	out := openapi.Report{
		Summary: openapi.Summary{
			Mismatch:     rep.Summary.Mismatch,
			ScheduleOnly: rep.Summary.ScheduleOnly,
			VisitOnly:    rep.Summary.VisitOnly,
			Match:        rep.Summary.Match,
		},
		Rows:     make([]openapi.Result, 0, len(rep.Rows)),
		Warnings: make([]openapi.Warning, 0, len(rep.Warnings)),
	}
	for _, r := range rep.Rows {
		out.Rows = append(out.Rows, result(r))
	}
	for _, w := range rep.Warnings {
		out.Warnings = append(out.Warnings, openapi.Warning{
			CalendarId: w.CalendarID, EventId: w.EventID, Start: w.Start, Message: w.Message,
		})
	}
	return out
}

func result(r judge.Result) openapi.Result {
	out := openapi.Result{
		Category: openapi.Category(r.Category),
		Date:     r.Date.String(),
		Client:   r.Client,
		Staff:    r.Staff,
		Schedule: side(r.Schedule),
		Visit:    side(r.Visit),
	}
	if c := r.Checks; c != nil {
		out.Checks = &openapi.Checks{
			Start:            openapi.Check{Ok: c.Start.OK},
			Service:          openapi.Check{Ok: c.Service.OK},
			ScheduleElapsed:  rangeCheck(c.ScheduleElapsed),
			VisitElapsed:     rangeCheck(c.VisitElapsed),
			ScheduleDuration: rangeCheck(c.ScheduleDuration),
			VisitDuration:    rangeCheck(c.VisitDuration),
			Additions:        openapi.Check{Ok: c.Additions.OK},
			DurationEqual:    c.DurationEqual,
			EndEqual:         c.EndEqual,
		}
	}
	return out
}

func side(s *judge.Side) *openapi.Side {
	if s == nil {
		return nil
	}
	return &openapi.Side{
		Line:      s.Line,
		Start:     s.Start.String(),
		End:       s.End.String(),
		Duration:  s.Duration,
		Service:   s.Service,
		Additions: s.Additions,
	}
}

func rangeCheck(c judge.RangeCheck) openapi.RangeCheck {
	return openapi.RangeCheck{Ok: c.OK, Minutes: c.Minutes, Range: rangeOf(c.Range)}
}

func rangeOf(r *servicerule.Range) *openapi.Range {
	if r == nil {
		return nil
	}
	return &openapi.Range{Min: r.Min, Max: r.Max}
}

func rowErrors(rows []record.RowError) []openapi.RowError {
	out := make([]openapi.RowError, 0, len(rows))
	for _, r := range rows {
		e := openapi.RowError{Source: openapi.InputSource(r.Source), Line: r.Line, Message: r.Message}
		if r.Column != "" {
			e.Column = &r.Column
		}
		out = append(out, e)
	}
	return out
}
