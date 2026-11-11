package calendarsync

import (
	"cmp"
	"context"
	"errors"
	"log/slog"
	"maps"
	"slices"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// 同期の処理の上限と間隔。
const (
	// syncBatch は、1 回に取るカレンダーの数の上限である。
	syncBatch = 5
	// syncCallTimeout は、1 つのカレンダーの変わった予定を読んで当てる時間の上限である。
	syncCallTimeout = time.Minute
	// syncLease は、取ったカレンダーをほかの処理に渡さない時間である。syncBatch 件を syncCallTimeout で終えても超えない長さにする。
	syncLease = 6 * time.Minute
)

// CalendarReader は、Syncer が、予定を当てる前に結び付けたカレンダーを読み直す。見つからないときは apperr.ErrNotFound を返す。
type CalendarReader interface {
	// Get は、外したカレンダーも返す。
	Get(ctx context.Context, id string) (calendar.ExternalCalendar, error)
}

// SyncerDeps は、Syncer が使うリポジトリと、外部のカレンダーを読む EventSource を事業所ごとに返す Sources である。
type SyncerDeps struct {
	Syncs     SyncRepository
	Calendars CalendarReader
	// Staff は、カレンダーの職員が退職したかを読む。
	Staff calendar.StaffRefs
	// Locks は、予定を当てる前に事業所の行を共有のロックで読み、予定の管理先を読む。読んだ後に、職員の休職、復職、退職と、
	// モードの変更を待たせる。退職がカレンダーを外した後と、モードを変えた後に、当てないためである。
	Locks   FacilityLock
	Sources calendar.SourceFor
	// Records と Visits は、読み戻し（ReadBackDue）が、書く期限を過ぎた保留の版を取って確定するか消し、使われなくなった訪問の情報を消す。
	Records PendingRecords
	Visits  calendar.UnusedVisits
	// Now は、読み戻しが書く期限と比べる時刻を返す。nil なら time.Now を使う。
	Now func() time.Time
}

// Applier は、外部のカレンダーの予定の変更を当てる規則である。
type Applier interface {
	// Apply は、カレンダー c の外部の予定 ev の変更を当てる。Syncer が 1 つの予定ごとに開くトランザクションの中で呼ぶ。
	Apply(ctx context.Context, c calendar.ExternalCalendar, ev calendar.Event) error
	// Settle は、カレンダー c の読んだ予定を全て当てた後に、Syncer が開くトランザクションの中で呼ぶ。full は、トークンを付けずに
	// 全ての予定を読んだか（最初の同期と、トークンが切れた 410 の後）で、eventIDs は、読んだ予定の ID である。
	Settle(ctx context.Context, c calendar.ExternalCalendar, full bool, eventIDs []string) error
}

// Appliers は、事業所の予定の管理先ごとの Applier である。組み立て（cmd/calendar-worker）が決めて Syncer に渡す（ADR-0021）。
// Applier の無いモードの事業所のカレンダーは、同期で読まない。
type Appliers map[organization.SourceMode]Applier

// errModeChanged は、同期の途中で事業所の予定の管理先が変わり、そのモードの Applier が無いので、残りの予定を当てないことを表す。
var errModeChanged = errors.New("同期の途中で事業所の予定の管理先が変わった")

// Syncer は、職員が結び付けた外部のカレンダーの変わった予定を、増分の取得（syncToken）で読み、事業所の予定の管理先の Applier で
// 当てる処理である。Applier の無いモードの事業所のカレンダーは取らない（ADR-0029）。
// トークンが切れていれば（410）、全ての予定を読み直す。
type Syncer struct {
	deps     SyncerDeps
	tx       tx.Transactor
	appliers Appliers
	modes    []organization.SourceMode
	interval time.Duration
	log      *slog.Logger
}

// NewSyncer は、カレンダーを読み、appliers の Applier で当てる Syncer を作る。カレンダーを読み終えたら、interval の後を次に読む時刻にする。
func NewSyncer(deps SyncerDeps, appliers Appliers, tx tx.Transactor, interval time.Duration, log *slog.Logger) *Syncer {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &Syncer{
		deps: deps, tx: tx, appliers: appliers, modes: slices.SortedFunc(maps.Keys(appliers), cmp.Compare), interval: interval, log: log,
	}
}

// SyncDue は、Applier のあるモードの事業所の、読む時刻を過ぎたカレンダーを取って同期し、取ったカレンダーの数を返す。
// 1 つのカレンダーを同期できなくても、残りを同期する。
// 取った後は、結果ごとの数の要約（calendar sync batch）と、同期の滞留（calendar sync backlog）をログに書く。
func (s *Syncer) SyncDue(ctx context.Context) (int, error) {
	start := time.Now()
	states, err := s.deps.Syncs.Claim(ctx, syncBatch, syncLease, s.modes)
	if err != nil {
		return 0, err
	}
	b := calendar.Batch{Claimed: len(states)}
	defer func() {
		b.Log(ctx, s.log, "calendar sync batch", time.Since(start))
		s.logBacklog(ctx)
	}()
	var finishErr error
	for _, st := range states {
		callCtx, cancel := context.WithTimeout(ctx, syncCallTimeout)
		r, o := s.sync(callCtx, st)
		cancel()
		// 止める合図で終えられなかったカレンダーは、前の状態のまま返し、次に起動したときにすぐ読む。
		if ctx.Err() != nil {
			r, o = SyncResult{SyncToken: st.SyncToken, Status: st.LastStatus, ErrorCode: st.LastError}, outcomeRequeued
		}
		o.count(&b)
		// 取ったカレンダーは、ctx が終わっても結果を書き、lease の間ほかの処理が読めないままにしない。
		if err := s.deps.Syncs.Finish(context.WithoutCancel(ctx), st, r); err != nil {
			finishErr = errors.Join(finishErr, err)
		}
	}
	return len(states), finishErr
}

// outcome は、1 つのカレンダーを同期した結果を、バッチの要約のどの数に足すかである。
type outcome int

const (
	outcomeSynced outcome = iota
	outcomeFailed
	// outcomeHeld は、当てずに置いたことを表す。途中でカレンダーが外れたかモードが変わったときである。
	outcomeHeld
	// outcomeRequeued は、止める合図で、前の状態のまま返したことを表す。
	outcomeRequeued
)

func (o outcome) count(b *calendar.Batch) {
	switch o {
	case outcomeSynced:
		b.Succeeded++
	case outcomeFailed:
		b.Failed++
	case outcomeHeld:
		b.Held++
	case outcomeRequeued:
		b.Requeued++
	}
}

// logBacklog は、Applier のあるモードの事業所の、読む時刻を過ぎたカレンダーの数と、最も古い最後の成功からの時間をログに書く。
// 止める合図の後は数えない。
func (s *Syncer) logBacklog(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	bl, err := s.deps.Syncs.Backlog(ctx, s.modes)
	if err != nil {
		s.log.WarnContext(ctx, "calendar sync backlog", slog.Any("error", err))
		return
	}
	s.log.InfoContext(ctx, "calendar sync backlog",
		slog.Int("overdue_count", bl.OverdueCount), slog.Int64("oldest_success_age_seconds", int64(bl.OldestSuccessAge.Seconds())))
}

// sync は、カレンダー st の変わった予定を読み、1 つずつトランザクションで当て、最後に Applier の Settle を呼ぶ。
// 当てられなかった予定があれば、トークンを進めずに返し、次に同じ予定から読み直す。
func (s *Syncer) sync(ctx context.Context, st SyncState) (SyncResult, outcome) {
	attrs := []any{slog.String("facility_id", st.Calendar.FacilityID), slog.String("external_calendar_id", st.Calendar.ID)}
	token := st.SyncToken
	src, err := s.deps.Sources(ctx, st.Calendar.FacilityID)
	if err == nil && src == nil {
		err = calendar.ErrNotConfigured
	}
	if err != nil {
		s.log.ErrorContext(ctx, "calendar sync source", append(attrs, slog.Any("error", err))...)
		code := SyncUnavailable
		return SyncResult{SyncToken: token, Status: SyncFailed, ErrorCode: &code, After: s.interval}, outcomeFailed
	}
	readAt := time.Now()
	ch, err := src.Changes(ctx, st.Calendar.CalendarID, token)
	if errors.Is(err, calendar.ErrSyncTokenExpired) {
		s.log.InfoContext(ctx, "calendar sync token expired", attrs...)
		token = ""
		readAt = time.Now()
		ch, err = src.Changes(ctx, st.Calendar.CalendarID, "")
	}
	if err != nil {
		s.log.WarnContext(ctx, "calendar sync failed", append(attrs, slog.Any("error", err))...)
		code := SyncUnavailable
		if errors.Is(err, calendar.ErrUnreadable) {
			code = SyncUnreadable
		}
		return SyncResult{SyncToken: token, Status: SyncFailed, ErrorCode: &code, After: s.interval}, outcomeFailed
	}
	eventIDs := make([]string, len(ch.Events))
	for i, ev := range ch.Events {
		eventIDs[i] = ev.ID
		ev = calendar.StampCancellation(ev, readAt)
		err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
			a, err := s.applierFor(ctx, st.Calendar)
			if err != nil {
				return err
			}
			return a.Apply(ctx, st.Calendar, ev)
		})
		if r, o, done := s.stopped(ctx, st, token, err, append(attrs, slog.String("event_id", ev.ID))); done {
			return r, o
		}
	}
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		a, err := s.applierFor(ctx, st.Calendar)
		if err != nil {
			return err
		}
		return a.Settle(ctx, st.Calendar, token == "", eventIDs)
	})
	if r, o, done := s.stopped(ctx, st, token, err, attrs); done {
		return r, o
	}
	return SyncResult{SyncToken: ch.NextSyncToken, Status: SyncSucceeded, Synced: true, After: s.interval}, outcomeSynced
}

// stopped は、カレンダー st の予定を当てるトランザクションのエラー err から、同期を止めて返す結果を決める。
// err が nil なら、done を false にして続けさせる。token は、この回で読んだときのトークンである。
func (s *Syncer) stopped(ctx context.Context, st SyncState, token string, err error, attrs []any) (SyncResult, outcome, bool) {
	switch {
	case err == nil:
		return SyncResult{}, 0, false
	case errors.Is(err, errCalendarUnlinked), errors.Is(err, errModeChanged):
		// 外したカレンダーと、Applier の無いモードの事業所のカレンダーは次から取らないので、トークンと状態は前のまま返す
		return SyncResult{SyncToken: st.SyncToken, Status: st.LastStatus, ErrorCode: st.LastError, After: s.interval}, outcomeHeld, true
	}
	s.log.ErrorContext(ctx, "calendar sync failed", append(attrs, slog.Any("error", err))...)
	code := SyncApplyFailed
	return SyncResult{SyncToken: token, Status: SyncFailed, ErrorCode: &code, After: s.interval}, outcomeFailed, true
}

// errCalendarUnlinked は、同期の途中でカレンダーが外れたので、残りの予定を当てないことを表す。
var errCalendarUnlinked = errors.New("同期の途中でカレンダーが外れた")

// applierFor は、事業所の行を共有のロックで読み、カレンダー c を外していないかを読み直して、事業所の予定の管理先の Applier を返す。
// 外していれば errCalendarUnlinked を、モードの Applier が無ければ errModeChanged を返す。トランザクションの中で呼ぶ。
// ロックは、トランザクションが終わるまで職員の休職、復職、退職とモードの変更を待たせる。退職とモードの変更は同じ事業所の行に
// 排他のロックを取るので、カレンダーを取った後に職員が退職しても、モードを buddy_primary にしても、外部の変更を当てない。
func (s *Syncer) applierFor(ctx context.Context, c calendar.ExternalCalendar) (Applier, error) {
	f, err := s.deps.Locks.GetForShare(ctx, c.FacilityID)
	if err != nil {
		return nil, err
	}
	cur, err := s.deps.Calendars.Get(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	if cur.DisabledAt != nil {
		return nil, errCalendarUnlinked
	}
	// カレンダーを外すようにする前の版の退職では、カレンダーが外れていないことがある
	if st, err := s.deps.Staff.Get(ctx, c.StaffID); err != nil {
		return nil, err
	} else if st.Status == staff.StatusRetired {
		return nil, errCalendarUnlinked
	}
	a, ok := s.appliers[f.SourceMode]
	if !ok {
		return nil, errModeChanged
	}
	return a, nil
}
