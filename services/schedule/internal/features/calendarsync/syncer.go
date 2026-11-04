package calendarsync

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
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
	// syncRetryAfter は、予定を書いている書き出しの処理を待って、カレンダーを読み直すまでの時間である。
	syncRetryAfter = 5 * time.Second
	// syncPollTick は、読む時刻を過ぎたカレンダーがあるかを確認する間隔の上限である。読む間隔は、カレンダーごとの読む時刻で決まる。
	syncPollTick = 5 * time.Second
)

// SyncerDeps は、Syncer が使うリポジトリと、外部のカレンダーを読む EventSource を事業所ごとに返す Sources である。
type SyncerDeps struct {
	Syncs     SyncRepository
	Calendars Calendars
	// Staff は、カレンダーの職員が退職したかを読む。
	Staff calendar.StaffRefs
	// Locks は、予定を当てる前に事業所の職員の休職、復職、退職を待たせる。退職がカレンダーを外した後に、当てないためである。
	Locks        calendar.FacilityLock
	Exports      ExportRepository
	Sources      calendar.SourceFor
	Schedules    calendar.ScheduleStore
	Recurring    calendar.RecurringStore
	Types        calendar.Types
	Patients     calendar.Patients
	ServiceCodes calendar.ServiceCodes
	Visits       calendar.VisitStore
}

// Applier は、外部のカレンダーの 1 つの予定の変更を、buddy の予定に当てる規則である。
type Applier interface {
	// Apply は、カレンダー c の外部の予定 ev の変更を buddy の予定に当てる。Syncer が 1 つの予定ごとに開くトランザクションの中で呼ぶ。
	// 予定を書いている書き出しの処理があれば、当てずに errExportWriting を返し、Syncer はカレンダーを後で読み直す。
	Apply(ctx context.Context, c calendar.ExternalCalendar, ev calendar.Event) error
}

// Syncer は、職員が結び付けた外部のカレンダーの変わった予定を、増分の取得（syncToken）で読み、buddy の予定に当てる処理である。
// ADR-0009 の段階 3 に当たる。当て方の規則は Applier にある。
// トークンが切れていれば（410）、全ての予定を読み直す。予定の対応の etag と比べるので、読み直しても同じ変更を 2 回は当てない。
type Syncer struct {
	deps     SyncerDeps
	tx       tx.Transactor
	apply    Applier
	interval time.Duration
	log      *slog.Logger
}

// NewSyncer は、カレンダーを interval ごとに読む Syncer を作る。
func NewSyncer(deps SyncerDeps, tx tx.Transactor, ids kernel.IDGenerator, interval time.Duration, log *slog.Logger) *Syncer {
	return &Syncer{
		deps: deps, tx: tx, interval: interval, log: log,
		apply: newReconcileApplier(
			deps.Calendars, deps.Exports, deps.Schedules, deps.Recurring, deps.Types, deps.Patients, deps.ServiceCodes, deps.Visits, ids,
		),
	}
}

// Run は、ctx が終わるまで、読む時刻を過ぎたカレンダーを全て同期する。読む時刻は、カレンダーを読み終えた時刻に
// interval を足した時刻で、確認する間隔は interval と syncPollTick の短い方である。
func (s *Syncer) Run(ctx context.Context) {
	t := time.NewTicker(min(s.interval, syncPollTick))
	defer t.Stop()
	for {
		for {
			n, err := s.SyncDue(ctx)
			if err != nil && ctx.Err() == nil {
				s.log.ErrorContext(ctx, "calendar sync", slog.Any("error", err))
			}
			if err != nil || n < syncBatch {
				break
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// SyncDue は、読む時刻を過ぎたカレンダーを取って同期し、取ったカレンダーの数を返す。1 つのカレンダーを同期できなくても、残りを同期する。
// 取った後は、結果ごとの数の要約（calendar sync batch）と、同期の滞留（calendar sync backlog）をログに書く。
func (s *Syncer) SyncDue(ctx context.Context) (int, error) {
	start := time.Now()
	states, err := s.deps.Syncs.Claim(ctx, syncBatch, syncLease)
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
	// outcomeHeld は、当てずに置いたことを表す。書き出しを待って読み直すときと、途中でカレンダーが外れたときである。
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

// logBacklog は、読む時刻を過ぎたカレンダーの数と、最も古い最後の成功からの時間をログに書く。止める合図の後は数えない。
func (s *Syncer) logBacklog(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	bl, err := s.deps.Syncs.Backlog(ctx)
	if err != nil {
		s.log.WarnContext(ctx, "calendar sync backlog", slog.Any("error", err))
		return
	}
	s.log.InfoContext(ctx, "calendar sync backlog",
		slog.Int("overdue_count", bl.OverdueCount), slog.Int64("oldest_success_age_seconds", int64(bl.OldestSuccessAge.Seconds())))
}

// sync は、カレンダー st の変わった予定を読み、1 つずつトランザクションで当てる。
// 当てられなかった予定があれば、トークンを進めずに返し、次に同じ予定から読み直す。
func (s *Syncer) sync(ctx context.Context, st SyncState) (SyncResult, outcome) {
	attrs := []any{slog.String("external_calendar_id", st.Calendar.ID)}
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
	ch, err := src.Changes(ctx, st.Calendar.CalendarID, token)
	if errors.Is(err, calendar.ErrSyncTokenExpired) {
		s.log.InfoContext(ctx, "calendar sync token expired", attrs...)
		token = ""
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
	for _, ev := range ch.Events {
		err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
			if err := s.stillLinked(ctx, st.Calendar); err != nil {
				return err
			}
			return s.apply.Apply(ctx, st.Calendar, ev)
		})
		if errors.Is(err, errCalendarUnlinked) {
			// 外したカレンダーは次から取らないので、トークンと状態は前のまま返す
			return SyncResult{SyncToken: st.SyncToken, Status: st.LastStatus, ErrorCode: st.LastError, After: s.interval}, outcomeHeld
		}
		if errors.Is(err, errExportWriting) {
			return SyncResult{SyncToken: token, Status: st.LastStatus, ErrorCode: st.LastError, After: syncRetryAfter}, outcomeHeld
		}
		if err != nil {
			s.log.ErrorContext(ctx, "calendar sync failed", append(attrs, slog.String("event_id", ev.ID), slog.Any("error", err))...)
			code := SyncApplyFailed
			return SyncResult{SyncToken: token, Status: SyncFailed, ErrorCode: &code, After: s.interval}, outcomeFailed
		}
	}
	return SyncResult{SyncToken: ch.NextSyncToken, Status: SyncSucceeded, After: s.interval}, outcomeSynced
}

// errCalendarUnlinked は、同期の途中でカレンダーが外れたので、残りの予定を当てないことを表す。
var errCalendarUnlinked = errors.New("同期の途中でカレンダーが外れた")

// stillLinked は、事業所の職員の休職、復職、退職をトランザクションの終わりまで待たせてから、カレンダー c を外していないかを
// 読み直す。外していれば errCalendarUnlinked を返す。退職は同じ事業所の行に排他のロックを取ってカレンダーを外すので、
// カレンダーを取った後に職員が退職しても、退職した職員の予定に外部の変更を当てない。トランザクションの中で呼ぶ。
func (s *Syncer) stillLinked(ctx context.Context, c calendar.ExternalCalendar) error {
	if err := s.deps.Locks.Share(ctx, c.FacilityID); err != nil {
		return err
	}
	cur, err := s.deps.Calendars.Get(ctx, c.ID)
	if err != nil {
		return err
	}
	if cur.DisabledAt != nil {
		return errCalendarUnlinked
	}
	// カレンダーを外すようにする前の版の退職では、カレンダーが外れていないことがある
	if st, err := s.deps.Staff.Get(ctx, c.StaffID); err != nil {
		return err
	} else if st.Status == staff.StatusRetired {
		return errCalendarUnlinked
	}
	return nil
}
