package calendar

import (
	"context"
	"fmt"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
)

// staleRunAfter を過ぎても running の取り込みは、止まった取り込みとみなし、次の取り込みを止めない。
const staleRunAfter = 10 * time.Minute

// ImportResult は、取り込みの記録と、前の取り込みで取り込んでいて今回は書かなかった予定の数である。
type ImportResult struct {
	Run             ImportRun
	AlreadyImported int
}

// Import は、カレンダー id の期間 rng の予定を読み直し、プレビューと同じ規則で読み替えて、1 つのトランザクションで書く。
// 確認が必要な予定には decisions の取り込み方を当てる。職員が休職していれば、新しい予定は書かない。
// 確認が必要な予定の集合が decisions と違うとき、読み替えた後に職員が休職か復職になったとき、
// 同じカレンダーの取り込みが進んでいるときは apperr.ErrConflict を返し、何も書かない。
// 読み替えた後に職員が退職し、カレンダーが外れたときは apperr.ErrNotFound を返し、何も書かない。
// ほかのエラーは Preview と同じである。
func (u *App) Import(ctx context.Context, id string, rng Range, decisions []Decision) (ImportResult, error) {
	if err := u.guard(ctx); err != nil {
		return ImportResult{}, err
	}
	p, ok := principal.From(ctx)
	if !ok {
		return ImportResult{}, fmt.Errorf("%w: 職員を特定できません", apperr.ErrForbidden)
	}
	c, err := u.active(ctx, id)
	if err != nil {
		return ImportResult{}, err
	}
	src, err := u.source(ctx, c.FacilityID)
	if err != nil {
		return ImportResult{}, err
	}
	run := ImportRun{
		ID: u.ids.NewID(), FacilityID: c.FacilityID, ExternalCalendarID: c.ID, RequestedBy: p.Staff.ID,
		RangeStart: rng.Start, RangeEnd: rng.End, Status: RunRunning,
	}
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if _, err := u.deps.Calendars.GetForUpdate(ctx, c.ID); err != nil {
			return err
		}
		running, err := u.deps.Calendars.RunningSince(ctx, c.ID, time.Now().Add(-staleRunAfter))
		if err != nil {
			return err
		}
		if running {
			return apperr.ConflictCode(CodeImportRunning, "このカレンダーの取り込みが進んでいます。終わってから、もう一度プレビューしてください")
		}
		return u.deps.Calendars.CreateRun(ctx, run)
	})
	if err != nil {
		return ImportResult{}, err
	}
	res, err := u.importPlan(ctx, src, c, rng, decisions, run)
	if err != nil {
		run.Status = RunFailed
		// 取り込みのエラーを返すので、記録の更新のエラーは返さない。止まった記録は staleRunAfter の後に次の取り込みを止めなくなる。
		_, _ = u.deps.Calendars.FinishRun(context.WithoutCancel(ctx), run)
		return ImportResult{}, err
	}
	return res, nil
}

func (u *App) importPlan(ctx context.Context, src EventSource, c ExternalCalendar, rng Range, decisions []Decision, run ImportRun) (ImportResult, error) {
	blocked, err := u.staffBlocked(ctx, c)
	if err != nil {
		return ImportResult{}, err
	}
	p, patients, err := u.plan(ctx, src, c, rng, blocked)
	if err != nil {
		return ImportResult{}, err
	}
	chosenSkip, err := p.applyDecisions(decisions, patients)
	if err != nil {
		return ImportResult{}, err
	}
	var res ImportResult
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := u.recheck(ctx, c, blocked); err != nil {
			return err
		}
		if err := u.write(ctx, c, p); err != nil {
			return err
		}
		run.Status = RunSucceeded
		run.ImportedCount = len(p.entries)
		run.SkippedCount = len(p.skippedItems) + chosenSkip
		finished, err := u.deps.Calendars.FinishRun(ctx, run)
		res = ImportResult{Run: finished, AlreadyImported: p.counts.AlreadyImported}
		return err
	})
	return res, err
}

// recheck は、取り込みを書くトランザクションの始めに、事業所の職員の休職、復職、退職を終わりまで待たせてから、
// カレンダーを外していないことと、職員の休職と訪問しない職員かが読み替えたときの blocked と同じことを確認する。
// 退職は事業所の同じ行に排他のロックを取り、残る予定を数えてカレンダーを外すので、退職とこの取り込みのどちらかが、
// もう片方のコミットを待ってから読む。取り込んだ予定が残れば退職を拒み、退職が先ならここでカレンダーが外れている。
// 訪問しない職員への変更も事業所の行に排他のロックを取るので、この取り込みと行き違わない。
// カレンダーが外れていれば apperr.ErrNotFound を、休職か訪問しない職員かが変わっていれば apperr.ErrConflict を返す。
func (u *App) recheck(ctx context.Context, c ExternalCalendar, blocked SkipReason) error {
	if err := u.deps.Staff.LockStatuses(ctx, c.FacilityID); err != nil {
		return err
	}
	if _, err := u.active(ctx, c.ID); err != nil {
		return err
	}
	now, err := u.staffBlocked(ctx, c)
	if err != nil {
		return err
	}
	if now != blocked {
		return errStaffStatusChanged
	}
	return nil
}

var errStaffStatusChanged = apperr.ConflictCode(CodeReviewChanged, "プレビューの後に、職員が休職か復職になったか、訪問するかが変わりました。もう一度プレビューしてください")

// write は、p の予定と除外する日と予定の対応を書く。トランザクションの中で呼ぶ。
func (u *App) write(ctx context.Context, c ExternalCalendar, p plan) error {
	types, err := u.deps.Types.List(ctx)
	if err != nil {
		return err
	}
	byCode := make(map[schedule.TypeCode]schedule.Type, len(types))
	for _, t := range types {
		byCode[t.Code] = t
	}
	created := map[string]string{}
	ex := excluder{recurring: u.deps.Recurring, done: map[replacement]bool{}}
	for _, e := range p.entries {
		if e.rule == nil {
			continue
		}
		slot, typ, err := u.slot(ctx, c, e, byCode)
		if err != nil {
			return err
		}
		rs, err := schedule.NewRecurring(u.ids.NewID(), slot, typ, e.rule.Rule)
		if err != nil {
			return err
		}
		if err := u.deps.Recurring.Create(ctx, rs); err != nil {
			return err
		}
		for _, d := range e.rule.ExclusionDates {
			if err := ex.exclude(ctx, rs.ID, d); err != nil {
				return err
			}
		}
		created[e.event.ID] = rs.ID
		if err := u.link(ctx, c, e, nil, &rs.ID); err != nil {
			return err
		}
	}
	resolve := func(r replacement) string {
		if r.recurringScheduleID != "" {
			return r.recurringScheduleID
		}
		return created[r.parentEventID]
	}
	for _, x := range p.exclusions {
		if id := resolve(x); id != "" {
			if err := ex.exclude(ctx, id, x.date); err != nil {
				return err
			}
		}
	}
	for _, e := range p.entries {
		if e.rule != nil {
			continue
		}
		slot, typ, err := u.slot(ctx, c, e, byCode)
		if err != nil {
			return err
		}
		sc, err := schedule.New(u.ids.NewID(), slot, typ)
		if err != nil {
			return err
		}
		if e.replaces != nil {
			// 親を取り込まないと選んだときは、置き換える繰り返しの予定が無いので、単発の予定にする。
			if id := resolve(*e.replaces); id != "" {
				if err := ex.exclude(ctx, id, e.replaces.date); err != nil {
					return err
				}
				d := e.replaces.date
				sc.RecurringScheduleID, sc.OriginalDate = &id, &d
			}
		}
		if err := u.deps.Schedules.Create(ctx, sc); err != nil {
			return err
		}
		if err := u.link(ctx, c, e, &sc.ID, nil); err != nil {
			return err
		}
	}
	return nil
}

// excluder は、繰り返しの予定から回を除外する。1 回の取り込みで同じ回を 2 回は書かない。
// PostgreSQL は一意の制約の違反でトランザクションを続けられなくなるので、違反を起こさずに重なりを除く。
type excluder struct {
	recurring Recurring
	done      map[replacement]bool
}

func (x excluder) exclude(ctx context.Context, recurringScheduleID string, d civil.Date) error {
	key := replacement{recurringScheduleID: recurringScheduleID, date: d}
	if x.done[key] {
		return nil
	}
	x.done[key] = true
	return x.recurring.AddExclusion(ctx, recurringScheduleID, d)
}

// slot は、取り込む予定 e の枠と種類を組み立てる。訪問の予定なら訪問の情報を書く。
func (u *App) slot(ctx context.Context, c ExternalCalendar, e entry, types map[schedule.TypeCode]schedule.Type) (schedule.Slot, schedule.Type, error) {
	slot := schedule.Slot{
		FacilityID:  c.FacilityID,
		StaffID:     c.StaffID,
		Date:        e.cand.Date,
		StartTime:   e.cand.StartTime,
		EndTime:     e.cand.EndTime,
		EndsNextDay: e.cand.EndsNextDay,
	}
	code := schedule.CodeNormal
	if e.cand.Kind == KindVisit {
		code = schedule.CodeVisit
		id, err := u.deps.Visits.Create(ctx, c.FacilityID, visit.Input{
			PatientID: e.patientID, AssignedStaffID: c.StaffID, ServiceCodeID: e.serviceCodeID,
		})
		if err != nil {
			return schedule.Slot{}, schedule.Type{}, err
		}
		slot.VisitInfoID = &id
	} else {
		title := e.cand.Title
		slot.Title = &title
	}
	typ, ok := types[code]
	if !ok {
		return schedule.Slot{}, schedule.Type{}, fmt.Errorf("予定の種類 %s がマスタに無い", code)
	}
	return slot, typ, nil
}

func (u *App) link(ctx context.Context, c ExternalCalendar, e entry, scheduleID, recurringScheduleID *string) error {
	synced := createdVersion
	l := Link{
		ID: u.ids.NewID(), FacilityID: c.FacilityID, ExternalCalendarID: c.ID, ExternalEventID: e.event.ID,
		ETag: e.event.ETag, SyncedVersion: &synced, ScheduleID: scheduleID, RecurringScheduleID: recurringScheduleID,
	}
	if e.parentID != "" {
		parent := e.parentID
		l.RecurringEventID = &parent
	}
	return u.deps.Calendars.CreateLink(ctx, l)
}
