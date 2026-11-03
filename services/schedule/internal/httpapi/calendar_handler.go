package httpapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
)

func toImportRun(r calendar.ImportRun) openapi.ImportRun {
	return openapi.ImportRun{
		Id:            r.ID,
		RangeStart:    r.RangeStart.String(),
		RangeEnd:      r.RangeEnd.String(),
		Status:        openapi.ImportRunStatus(r.Status),
		ImportedCount: r.ImportedCount,
		SkippedCount:  r.SkippedCount,
		StartedAt:     r.StartedAt,
		FinishedAt:    r.FinishedAt,
	}
}

func toExternalCalendar(c calendar.ExternalCalendar) openapi.ExternalCalendar {
	out := openapi.ExternalCalendar{
		Id:         c.ID,
		FacilityId: c.FacilityID,
		StaffId:    c.StaffID,
		Provider:   openapi.ExternalCalendarProvider(c.Provider),
		CalendarId: c.CalendarID,
		CreatedAt:  c.CreatedAt,
		UpdatedAt:  c.UpdatedAt,
	}
	if c.LastImport != nil {
		run := toImportRun(*c.LastImport)
		out.LastImport = &run
	}
	return out
}

func toImportPreview(p calendar.Preview) openapi.ImportPreview {
	c := p.Counts
	return openapi.ImportPreview{
		RangeStart: p.Range.Start.String(),
		RangeEnd:   p.Range.End.String(),
		Counts: openapi.ImportCounts{
			Import:              c.Import,
			ImportVisit:         c.ImportVisit,
			ImportNormal:        c.ImportNormal,
			ExpandedOccurrences: c.ExpandedOccurrences,
			Recurring:           c.Recurring,
			RecurringAsRule:     c.RecurringAsRule,
			RecurringExpanded:   c.RecurringExpanded,
			NeedsReview:         c.NeedsReview,
			Skipped:             c.Skipped,
			AlreadyImported:     c.AlreadyImported,
		},
		NeedsReview: mapSlice(p.ReviewItems, toImportReviewItem),
		Skipped:     mapSlice(p.SkippedItems, toImportSkippedItem),
	}
}

func toImportReviewItem(r calendar.ReviewItem) openapi.ImportReviewItem {
	out := openapi.ImportReviewItem{
		ExternalEventId: r.ExternalEventID,
		Revision:        r.Revision,
		Date:            r.Date.String(),
		StartTime:       r.StartTime.String(),
		EndTime:         r.EndTime.String(),
		EndsNextDay:     r.EndsNextDay,
		Service:         r.Service,
		ClientName:      r.Client,
		Reason:          openapi.ImportReviewItemReason(r.Reason),
		Candidates: mapSlice(r.Candidates, func(p calendar.PatientRef) openapi.PatientCandidate {
			return openapi.PatientCandidate{PatientId: p.ID, Name: p.Name, AssignedStaffName: p.AssignedStaffName}
		}),
	}
	if r.Recurrence != nil {
		rule := toRecurringRule(*r.Recurrence)
		out.Recurrence = &rule
	}
	return out
}

func toImportSkippedItem(s calendar.Skipped) openapi.ImportSkippedItem {
	return openapi.ImportSkippedItem{
		Date:        stringPtr(s.Date),
		StartTime:   stringPtr(s.StartTime),
		EndTime:     stringPtr(s.EndTime),
		EndsNextDay: s.EndsNextDay,
		AllDay:      s.AllDay,
		Reason:      openapi.ImportSkippedItemReason(s.Reason),
	}
}

// importRange は、本文の期間を読み、期間の規則を検証する。
func importRange(start, end string) (calendar.Range, error) {
	s, err := bodyDate(start)
	if err != nil {
		return calendar.Range{}, err
	}
	e, err := bodyDate(end)
	if err != nil {
		return calendar.Range{}, err
	}
	return calendar.NewRange(s, e)
}

func (s server) GetCalendarServiceAccount(ctx context.Context, req openapi.GetCalendarServiceAccountRequestObject) (openapi.GetCalendarServiceAccountResponseObject, error) {
	email, err := s.u.Calendars.ServiceAccount(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	return openapi.GetCalendarServiceAccount200JSONResponse{Email: email}, nil
}

func (s server) ListExternalCalendars(ctx context.Context, req openapi.ListExternalCalendarsRequestObject) (openapi.ListExternalCalendarsResponseObject, error) {
	cs, err := s.u.Calendars.List(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	return openapi.ListExternalCalendars200JSONResponse{Items: mapSlice(cs, toExternalCalendar)}, nil
}

func (s server) CreateExternalCalendar(ctx context.Context, req openapi.CreateExternalCalendarRequestObject) (openapi.CreateExternalCalendarResponseObject, error) {
	c, err := s.u.Calendars.Link(ctx, req.FacilityId, req.Body.StaffId, req.Body.CalendarId)
	if err != nil {
		return nil, err
	}
	return openapi.CreateExternalCalendar201JSONResponse(toExternalCalendar(c)), nil
}

func (s server) CreateExternalCalendarCheck(ctx context.Context, req openapi.CreateExternalCalendarCheckRequestObject) (openapi.CreateExternalCalendarCheckResponseObject, error) {
	if err := s.u.Calendars.Check(ctx, req.FacilityId, req.Body.CalendarId); err != nil {
		return nil, err
	}
	return openapi.CreateExternalCalendarCheck200JSONResponse{Readable: true}, nil
}

func (s server) RemoveExternalCalendar(ctx context.Context, req openapi.RemoveExternalCalendarRequestObject) (openapi.RemoveExternalCalendarResponseObject, error) {
	if err := s.u.Calendars.Unlink(ctx, req.ExternalCalendarId); err != nil {
		return nil, err
	}
	return openapi.RemoveExternalCalendar204Response{}, nil
}

func (s server) CreateCalendarImportPreview(ctx context.Context, req openapi.CreateCalendarImportPreviewRequestObject) (openapi.CreateCalendarImportPreviewResponseObject, error) {
	rng, err := importRange(req.Body.RangeStart, req.Body.RangeEnd)
	if err != nil {
		return nil, err
	}
	p, err := s.u.Calendars.Preview(ctx, req.ExternalCalendarId, rng)
	if err != nil {
		return nil, err
	}
	return openapi.CreateCalendarImportPreview200JSONResponse(toImportPreview(p)), nil
}

func (s server) CreateCalendarImport(ctx context.Context, req openapi.CreateCalendarImportRequestObject) (openapi.CreateCalendarImportResponseObject, error) {
	b := req.Body
	rng, err := importRange(b.RangeStart, b.RangeEnd)
	if err != nil {
		return nil, err
	}
	decisions := make([]calendar.Decision, len(b.Decisions))
	for i, d := range b.Decisions {
		decisions[i] = calendar.Decision{ExternalEventID: d.ExternalEventId, Action: calendar.Action(d.Action), Revision: d.Revision}
		if d.PatientId != nil {
			decisions[i].PatientID = *d.PatientId
		}
	}
	res, err := s.u.Calendars.Import(ctx, req.ExternalCalendarId, rng, decisions)
	if err != nil {
		return nil, err
	}
	run := toImportRun(res.Run)
	return openapi.CreateCalendarImport201JSONResponse{
		Id:                   run.Id,
		ExternalCalendarId:   res.Run.ExternalCalendarID,
		RangeStart:           run.RangeStart,
		RangeEnd:             run.RangeEnd,
		Status:               openapi.ImportResultStatus(run.Status),
		ImportedCount:        run.ImportedCount,
		SkippedCount:         run.SkippedCount,
		AlreadyImportedCount: res.AlreadyImported,
		StartedAt:            run.StartedAt,
		FinishedAt:           run.FinishedAt,
	}, nil
}

func optionalID(id string) *openapi.ID {
	if id == "" {
		return nil
	}
	return &id
}

func toCalendarExport(e calendar.Export) openapi.CalendarExport {
	out := openapi.CalendarExport{
		Id:                  e.ID,
		ScheduleId:          optionalID(e.ScheduleID),
		RecurringScheduleId: optionalID(e.RecurringScheduleID),
		Status:              openapi.CalendarExportStatus(e.Status),
		Attempts:            e.Attempts,
		UpdatedAt:           e.UpdatedAt,
	}
	if e.ErrorCode != nil {
		c := openapi.CalendarExportErrorCode(*e.ErrorCode)
		out.ErrorCode = &c
	}
	return out
}

func toCalendarExportIssue(i calendar.ExportIssue) openapi.CalendarExportIssue {
	e := toCalendarExport(i.Export)
	out := openapi.CalendarExportIssue{
		Id:                  e.Id,
		ScheduleId:          e.ScheduleId,
		RecurringScheduleId: e.RecurringScheduleId,
		Status:              openapi.CalendarExportIssueStatus(e.Status),
		Attempts:            e.Attempts,
		UpdatedAt:           e.UpdatedAt,
		StaffId:             i.StaffID,
		StaffName:           i.StaffName,
		Date:                i.Date.String(),
		StartTime:           i.StartTime.String(),
		EndTime:             i.EndTime.String(),
		EndsNextDay:         i.EndsNextDay,
		Acceptable:          i.IsAcceptable(),
	}
	if e.ErrorCode != nil {
		c := openapi.CalendarExportIssueErrorCode(*e.ErrorCode)
		out.ErrorCode = &c
	}
	return out
}

func (s server) ListCalendarExportIssues(ctx context.Context, req openapi.ListCalendarExportIssuesRequestObject) (openapi.ListCalendarExportIssuesResponseObject, error) {
	issues, err := s.u.Calendars.ListExportIssues(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	return openapi.ListCalendarExportIssues200JSONResponse{Items: mapSlice(issues, toCalendarExportIssue)}, nil
}

func (s server) CreateCalendarExportRetry(ctx context.Context, req openapi.CreateCalendarExportRetryRequestObject) (openapi.CreateCalendarExportRetryResponseObject, error) {
	e, err := s.u.Calendars.RetryExport(ctx, req.CalendarExportId)
	if err != nil {
		return nil, err
	}
	return openapi.CreateCalendarExportRetry202JSONResponse(toCalendarExport(e)), nil
}

func (s server) CreateCalendarExportAcceptance(ctx context.Context, req openapi.CreateCalendarExportAcceptanceRequestObject) (openapi.CreateCalendarExportAcceptanceResponseObject, error) {
	e, err := s.u.Calendars.AcceptExport(ctx, req.CalendarExportId)
	if err != nil {
		return nil, err
	}
	return openapi.CreateCalendarExportAcceptance200JSONResponse(toCalendarExport(e)), nil
}
