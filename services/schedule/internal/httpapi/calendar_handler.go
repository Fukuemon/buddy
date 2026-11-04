package httpapi

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi/openapi"
)

func toImportRun(r calendar.ImportRun) openapi.ImportRun {
	return openapi.ImportRun{
		Id:            r.ID,
		RangeStart:    r.RangeStart.String(),
		RangeEnd:      rangeEnd(r.RangeEnd),
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

func toImportPreview(p calendarimport.ImportPreview) openapi.ImportPreview {
	c := p.Counts
	return openapi.ImportPreview{
		RangeStart: p.Range.Start.String(),
		RangeEnd:   rangeEnd(p.Range.End),
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
			Overwrite:           c.Overwrite,
		},
		NeedsReview: mapSlice(p.ReviewItems, toImportReviewItem),
		Skipped:     mapSlice(p.SkippedItems, toImportSkippedItem),
	}
}

func toImportReviewItem(r calendarimport.ReviewItem) openapi.ImportReviewItem {
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
		Candidates: mapSlice(r.Candidates, func(p calendarimport.PatientRef) openapi.PatientCandidate {
			return openapi.PatientCandidate{PatientId: p.ID, Name: p.Name, AssignedStaffName: p.AssignedStaffName}
		}),
	}
	if r.Recurrence != nil {
		rule := toRecurringRule(*r.Recurrence)
		out.Recurrence = &rule
	}
	return out
}

func toImportSkippedItem(s calendarimport.Skipped) openapi.ImportSkippedItem {
	return openapi.ImportSkippedItem{
		Date:        stringPtr(s.Date),
		StartTime:   stringPtr(s.StartTime),
		EndTime:     stringPtr(s.EndTime),
		EndsNextDay: s.EndsNextDay,
		AllDay:      s.AllDay,
		Reason:      openapi.ImportSkippedItemReason(s.Reason),
	}
}

// rangeEnd は、期間の最後の日を返す。終わりを持たない期間（零の値）では nil を返す。
func rangeEnd(d civil.Date) *string {
	if d.IsZero() {
		return nil
	}
	s := d.String()
	return &s
}

// importRange は、本文の期間を読み、期間の規則を検証する。end が nil なら、終わりを持たない期間（切り替えの取り込み）にする。
// 終わりを持たない期間を受けるかは、取り込みの操作が事業所の切り替えで決める。
func importRange(start string, end *string) (calendarimport.Range, error) {
	s, err := bodyDate(start)
	if err != nil {
		return calendarimport.Range{}, err
	}
	if end == nil {
		return calendarimport.Range{Start: s}, nil
	}
	e, err := bodyDate(*end)
	if err != nil {
		return calendarimport.Range{}, err
	}
	return calendarimport.NewRange(s, e)
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
	decisions := make([]calendarimport.Decision, len(b.Decisions))
	for i, d := range b.Decisions {
		decisions[i] = calendarimport.Decision{ExternalEventID: d.ExternalEventId, Action: calendarimport.Action(d.Action), Revision: d.Revision}
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

func toCalendarCutover(c calendarimport.Cutover) openapi.CalendarCutover {
	return openapi.CalendarCutover{
		Id: c.ID, FacilityId: c.FacilityID, Status: openapi.CalendarCutoverStatus(c.Status), RangeStart: c.RangeStart.String(),
		StartedBy: c.StartedBy, StartedAt: c.StartedAt, FinishedAt: c.FinishedAt,
	}
}

func toCalendarCutoverCalendar(c calendarimport.CutoverCalendar) openapi.CalendarCutoverCalendar {
	s := toCalendarSyncStatus(c.Sync)
	out := openapi.CalendarCutoverCalendar{
		ExternalCalendarId: s.ExternalCalendarId, StaffId: s.StaffId, StaffName: s.StaffName,
		LastStatus: openapi.CalendarCutoverCalendarLastStatus(s.LastStatus), LastSucceededAt: s.LastSucceededAt,
	}
	if s.LastError != nil {
		code := openapi.CalendarCutoverCalendarLastError(*s.LastError)
		out.LastError = &code
	}
	if c.LastImport != nil {
		run := toImportRun(*c.LastImport)
		out.LastImport = &run
	}
	return out
}

func toCalendarCutoverUnmet(u calendarimport.Unmet) openapi.CalendarCutoverUnmet {
	out := openapi.CalendarCutoverUnmet{
		ExternalCalendarId: u.ExternalCalendarID, StaffId: u.StaffID, StaffName: u.StaffName,
		Reason: openapi.CalendarCutoverUnmetReason(u.Reason), ExternalEventId: nonEmpty(&u.ExternalEventID),
		Date: stringPtr(u.Date), StartTime: stringPtr(u.StartTime), EndTime: stringPtr(u.EndTime), EndsNextDay: u.EndsNextDay,
	}
	if u.ReviewReason != "" {
		r := openapi.CalendarCutoverUnmetReviewReason(u.ReviewReason)
		out.ReviewReason = &r
	}
	return out
}

// GetCalendarCutoverStatus は、事業所の切り替えの状況を返す。
func (s server) GetCalendarCutoverStatus(ctx context.Context, req openapi.GetCalendarCutoverStatusRequestObject) (openapi.GetCalendarCutoverStatusResponseObject, error) {
	st, err := s.u.Calendars.GetCutover(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	out := openapi.GetCalendarCutoverStatus200JSONResponse{Calendars: mapSlice(st.Calendars, toCalendarCutoverCalendar)}
	if st.Cutover != nil {
		c := toCalendarCutover(*st.Cutover)
		out.Cutover = &c
	}
	return out, nil
}

// StartCalendarCutover は、事業所の切り替えを始め、始めた切り替えを返す。
func (s server) StartCalendarCutover(ctx context.Context, req openapi.StartCalendarCutoverRequestObject) (openapi.StartCalendarCutoverResponseObject, error) {
	c, err := s.u.Calendars.StartCutover(ctx, req.FacilityId)
	if err != nil {
		return nil, err
	}
	return openapi.StartCalendarCutover201JSONResponse(toCalendarCutover(c)), nil
}

// CreateCalendarCutoverCompletion は、切り替えを完了し、完了した切り替えを返す。完了の確認を満たさないときは、一覧を付けた 409 を返す。
func (s server) CreateCalendarCutoverCompletion(ctx context.Context, req openapi.CreateCalendarCutoverCompletionRequestObject) (openapi.CreateCalendarCutoverCompletionResponseObject, error) {
	c, err := s.u.Calendars.CompleteCutover(ctx, req.CalendarCutoverId)
	if ie, ok := errors.AsType[*calendarimport.IncompleteError](err); ok {
		items := mapSlice(ie.Items, toCalendarCutoverUnmet)
		return openapi.CreateCalendarCutoverCompletion409JSONResponse{
			Code: openapi.CalendarCutoverIncompleteCode(calendarimport.CodeCutoverIncomplete), Message: ie.Error(), Items: &items,
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return openapi.CreateCalendarCutoverCompletion200JSONResponse(toCalendarCutover(c)), nil
}

// CancelCalendarCutover は、切り替えをやめ、やめた切り替えを返す。
func (s server) CancelCalendarCutover(ctx context.Context, req openapi.CancelCalendarCutoverRequestObject) (openapi.CancelCalendarCutoverResponseObject, error) {
	c, err := s.u.Calendars.CancelCutover(ctx, req.CalendarCutoverId)
	if err != nil {
		return nil, err
	}
	return openapi.CancelCalendarCutover200JSONResponse(toCalendarCutover(c)), nil
}
