package calendarimport

import (
	"cmp"
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// CompleteCutover は、切り替えを完了し、事業所の予定の正本を buddy にする（ADR-0031）。
type CompleteCutover struct {
	calendars          Calendars
	accounts           calendar.Accounts
	staff              calendar.StaffRefs
	patients           calendar.Patients
	recurringSchedules kernel.Finder[scheduleview.RecurringDetail]
	serviceCodes       calendar.ServiceCodes
	facilities         FacilityModes
	syncs              scheduleview.CalendarSyncs
	cutovers           CutoverRepository
	projections        Projections
	tx                 tx.Transactor
	guard              kernel.Guard
}

// NewCompleteCutover は CompleteCutover を作る。
func NewCompleteCutover(calendars Calendars, accounts calendar.Accounts, staff calendar.StaffRefs, patients calendar.Patients, recurringSchedules kernel.Finder[scheduleview.RecurringDetail], serviceCodes calendar.ServiceCodes, facilities FacilityModes, syncs scheduleview.CalendarSyncs, cutovers CutoverRepository, projections Projections, tx tx.Transactor, guard kernel.Guard) CompleteCutover {
	return CompleteCutover{
		calendars: calendars, accounts: accounts, staff: staff, patients: patients, recurringSchedules: recurringSchedules, serviceCodes: serviceCodes,
		facilities: facilities, syncs: syncs, cutovers: cutovers, projections: projections, tx: tx, guard: guard,
	}
}

// Do は、切り替え id の完了の確認をし、満たせば事業所を buddy_primary にし、事業所の Projection の行を消し、切り替えを completed にして返す。
// Google カレンダーを、切り替えの月の初日から先の全てで、トランザクションの前に読み直す。事業所の行を排他のロックで取った
// トランザクションの中で、外していないカレンダーごとに、次の 3 つを確認する。
//   - この切り替えで取り込み、最後の取り込みの後に同期が成功している。
//   - 読み直した予定が全て、予定の対応を持つか、取り込みで取り込まないと決めた予定で、規則に写せない繰り返しの予定が残っていない。
//   - 予定の対応の etag と、Google の etag が同じである。
//
// 満たさないカレンダーか予定があれば、一覧を持つ *IncompleteError を返し、何も書かない。切り替えは open のままである。
// 切り替えが無いときは apperr.ErrNotFound を、open でないときは code が CodeCutoverNotOpen の apperr.ErrConflict を返す。
// Google カレンダーを読めないときは calendar.ErrUnreadable か calendar.ErrUnavailable か calendar.ErrNotConfigured を返す。
func (u CompleteCutover) Do(ctx context.Context, id string) (Cutover, error) {
	if err := u.guard(ctx); err != nil {
		return Cutover{}, err
	}
	c, err := u.cutovers.Get(ctx, id)
	if err != nil {
		return Cutover{}, err
	}
	if c.Status != CutoverOpen {
		return Cutover{}, errCutoverNotOpen
	}
	read, err := u.readCalendars(ctx, c)
	if err != nil {
		return Cutover{}, err
	}
	var out Cutover
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		c, err := lockOpen(ctx, u.facilities, u.cutovers, id)
		if err != nil {
			return err
		}
		unmet, err := u.unmet(ctx, c, read)
		if err != nil {
			return err
		}
		if len(unmet) > 0 {
			return &IncompleteError{Items: unmet}
		}
		f, err := u.facilities.GetForUpdate(ctx, c.FacilityID)
		if err != nil {
			return err
		}
		if err := organization.RequireSourceModeTransition(f.SourceMode, organization.SourceBuddyPrimary); err != nil {
			return err
		}
		if err := u.facilities.ChangeSourceMode(ctx, f.ID, organization.SourceBuddyPrimary); err != nil {
			return err
		}
		if err := u.projections.DeleteByFacility(ctx, f.ID); err != nil {
			return err
		}
		out, err = u.cutovers.Finish(ctx, c.ID, CutoverCompleted)
		return err
	})
	return out, err
}

// readCalendars は、事業所の外していないカレンダーの、切り替えの期間の Google の予定を、カレンダーの ID ごとに読む。
func (u CompleteCutover) readCalendars(ctx context.Context, c Cutover) (map[string][]calendar.Event, error) {
	cals, err := u.calendars.ListByFacility(ctx, c.FacilityID)
	if err != nil || len(cals) == 0 {
		return map[string][]calendar.Event{}, err
	}
	src, err := calendar.Source(ctx, u.accounts, c.FacilityID)
	if err != nil {
		return nil, err
	}
	out := make(map[string][]calendar.Event, len(cals))
	for _, cal := range cals {
		events, err := readEvents(ctx, src, cal, c.Range())
		if err != nil {
			return nil, err
		}
		out[cal.ID] = events
	}
	return out, nil
}

// unmet は、切り替え c の完了の確認を満たさないカレンダーと予定を返す。read は、トランザクションの前に読んだ Google の予定である。
// トランザクションの中で呼ぶ。トランザクションの前に無かったカレンダーは、取り込んでいないカレンダーにする。
func (u CompleteCutover) unmet(ctx context.Context, c Cutover, read map[string][]calendar.Event) ([]Unmet, error) {
	cals, err := u.calendars.ListByFacility(ctx, c.FacilityID)
	if err != nil {
		return nil, err
	}
	syncList, err := u.syncs.ListSyncsByFacility(ctx, c.FacilityID)
	if err != nil {
		return nil, err
	}
	syncs := make(map[string]scheduleview.CalendarSync, len(syncList))
	for _, s := range syncList {
		syncs[s.ExternalCalendarID] = s
	}
	latest, err := u.cutovers.ListLatestRuns(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	runs := make(map[string]calendar.ImportRun, len(latest))
	for _, r := range latest {
		runs[r.ExternalCalendarID] = r
	}
	d := planDeps{calendars: u.calendars, patients: u.patients, recurringSchedules: u.recurringSchedules, serviceCodes: u.serviceCodes}
	var out []Unmet
	for _, cal := range cals {
		s := syncs[cal.ID]
		mark := func(items []Unmet) {
			for _, it := range items {
				it.ExternalCalendarID, it.StaffID, it.StaffName = cal.ID, cal.StaffID, s.StaffName
				out = append(out, it)
			}
		}
		run, imported := runs[cal.ID]
		events, readBefore := read[cal.ID]
		if !imported || !readBefore {
			mark([]Unmet{{Reason: UnmetNotImported}})
			continue
		}
		if s.LastSucceededAt == nil || run.FinishedAt == nil || !s.LastSucceededAt.After(*run.FinishedAt) {
			mark([]Unmet{{Reason: UnmetSyncStale}})
		}
		items, err := u.unmetEvents(ctx, d, c, cal, events)
		if err != nil {
			return nil, err
		}
		mark(items)
	}
	return out, nil
}

// unmetEvents は、カレンダー cal の、読み直した予定 events のうち、取り込んでいないか、取り込み方を決めていないか、
// 取り込んだ後に Google で変わったか消えた予定を、日時の順（日時の無い予定は最後）に返す。
func (u CompleteCutover) unmetEvents(ctx context.Context, d planDeps, c Cutover, cal calendar.ExternalCalendar, events []calendar.Event) ([]Unmet, error) {
	blocked, err := staffBlocked(ctx, u.staff, cal)
	if errors.Is(err, apperr.ErrNotFound) {
		// 退職した職員のカレンダーは取り込まないので、確認する予定が無い
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p, _, err := planRead(ctx, d, nil, cal, c.Range(), events, blocked, planMode{cutover: true})
	if err != nil {
		return nil, err
	}
	skipList, err := u.cutovers.ListSkips(ctx, c.ID, cal.ID)
	if err != nil {
		return nil, err
	}
	skips := make(map[string]string, len(skipList))
	for _, s := range skipList {
		skips[s.ExternalEventID] = s.Revision
	}
	links, err := u.calendars.ListLinks(ctx, cal.ID)
	if err != nil {
		return nil, err
	}
	out := append(p.unmetEvents(skips), staleUnmets(events, links)...)
	slices.SortStableFunc(out, func(a, b Unmet) int {
		return cmp.Or(compareSlot(a.Date, a.StartTime, b.Date, b.StartTime), strings.Compare(a.ExternalEventID, b.ExternalEventID))
	})
	return out, nil
}
