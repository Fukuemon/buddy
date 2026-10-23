package calendar

import (
	"context"
	"errors"
	"log/slog"
	"time"

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

// SyncStatus は、カレンダーの最後の同期の結果である。
type SyncStatus string

// SyncStatus の値。
const (
	SyncNever     SyncStatus = "never"
	SyncSucceeded SyncStatus = "succeeded"
	SyncFailed    SyncStatus = "failed"
)

// SyncErrorCode は、同期できなかった理由である。カレンダーの ID と予定のタイトルを含めないよう、決まった値だけを持つ。
type SyncErrorCode string

// SyncErrorCode の値。
const (
	// SyncUnreadable は、カレンダーが無いか、サービスアカウントに共有されていないことを表す。
	SyncUnreadable SyncErrorCode = "unreadable"
	// SyncUnavailable は、外部のカレンダーに届かないか、外部のカレンダーがエラーを返したことを表す。
	SyncUnavailable SyncErrorCode = "unavailable"
	// SyncApplyFailed は、読んだ予定を buddy に当てられず、トークンを進めなかったことを表す。
	SyncApplyFailed SyncErrorCode = "apply"
)

// SyncState は、同期の処理が取った 1 つのカレンダーと、その同期の状態である。
type SyncState struct {
	Calendar ExternalCalendar
	// SyncToken は、次の増分の取得に使うトークンで、全ての予定を読むときは空である。
	SyncToken  string
	LastStatus SyncStatus
	LastError  *SyncErrorCode
	// LockedUntil は、取ったときに決めた期限である。結果を書くときに、ほかの処理が取り直していないかを比べる。
	LockedUntil time.Time
}

// SyncResult は、1 つのカレンダーを同期した結果である。After の後に、もう一度読む。
type SyncResult struct {
	SyncToken string
	Status    SyncStatus
	ErrorCode *SyncErrorCode
	After     time.Duration
}

// SyncRepository は、カレンダーの同期の状態を読み書きする。
type SyncRepository interface {
	// Claim は、読む時刻を過ぎた外していないカレンダーを max 件まで取り、lease の間はほかの処理に渡さないようにして返す。
	// 同期の状態の行が無いカレンダーには、行を足してから取る。
	Claim(ctx context.Context, max int, lease time.Duration) ([]SyncState, error)
	// Finish は、s を同期した結果 r を書く。s を取った後にほかの処理が取り直していれば（lease が切れたとき）、何も書かない。
	Finish(ctx context.Context, s SyncState, r SyncResult) error
}

// SourceFor は、事業所 facilityID の外部のカレンダーを読む EventSource を返す。
type SourceFor func(ctx context.Context, facilityID string) (EventSource, error)

// WriterFor は、事業所 facilityID の外部のカレンダーに書く EventWriter を返す。
type WriterFor func(ctx context.Context, facilityID string) (EventWriter, error)

// Accounts は、事業所ごとのサービスアカウントで外部のカレンダーを読み書きする手段である（ADR-0012）。
// 事業所にサービスアカウントの設定が無ければ、どのメソッドも ErrNotConfigured を返す。
type Accounts interface {
	// ServiceAccount は、事業所 facilityID の職員がカレンダーを共有する相手のメールアドレスを返す。
	ServiceAccount(ctx context.Context, facilityID string) (string, error)
	// Source は、事業所 facilityID のサービスアカウントで外部のカレンダーを読む EventSource を返す。
	Source(ctx context.Context, facilityID string) (EventSource, error)
	// Writer は、事業所 facilityID のサービスアカウントで外部のカレンダーに書く EventWriter を返す。
	Writer(ctx context.Context, facilityID string) (EventWriter, error)
}

// SyncerDeps は、Syncer が使うリポジトリと、外部のカレンダーを読む EventSource を事業所ごとに返す Sources である。
type SyncerDeps struct {
	Syncs        SyncRepository
	Calendars    Repository
	Exports      ExportRepository
	Sources      SourceFor
	Schedules    ScheduleStore
	Recurring    RecurringStore
	Types        Types
	Patients     Patients
	ServiceCodes ServiceCodes
	Visits       VisitStore
}

// Syncer は、職員が結び付けた外部のカレンダーの変わった予定を、増分の取得（syncToken）で読み、buddy の予定に当てる処理である。
// ADR-0009 の段階 3 に当たる。当て方の規則は applier にある。
// トークンが切れていれば（410）、全ての予定を読み直す。予定の対応の etag と比べるので、読み直しても同じ変更を 2 回は当てない。
type Syncer struct {
	deps     SyncerDeps
	tx       tx.Transactor
	apply    applier
	interval time.Duration
	log      *slog.Logger
}

// NewSyncer は、カレンダーを interval ごとに読む Syncer を作る。
func NewSyncer(deps SyncerDeps, tx tx.Transactor, ids kernel.IDGenerator, interval time.Duration, log *slog.Logger) *Syncer {
	return &Syncer{
		deps: deps, tx: tx, interval: interval, log: log,
		apply: applier{
			calendars: deps.Calendars, exports: deps.Exports, schedules: deps.Schedules, recurring: deps.Recurring,
			types: deps.Types, patients: deps.Patients, serviceCodes: deps.ServiceCodes, visits: deps.Visits, ids: ids, now: time.Now,
		},
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
func (s *Syncer) SyncDue(ctx context.Context) (int, error) {
	states, err := s.deps.Syncs.Claim(ctx, syncBatch, syncLease)
	if err != nil {
		return 0, err
	}
	var finishErr error
	for _, st := range states {
		callCtx, cancel := context.WithTimeout(ctx, syncCallTimeout)
		r := s.sync(callCtx, st)
		cancel()
		// 止める合図で終えられなかったカレンダーは、前の状態のまま返し、次に起動したときにすぐ読む。
		if ctx.Err() != nil {
			r = SyncResult{SyncToken: st.SyncToken, Status: st.LastStatus, ErrorCode: st.LastError}
		}
		// 取ったカレンダーは、ctx が終わっても結果を書き、lease の間ほかの処理が読めないままにしない。
		if err := s.deps.Syncs.Finish(context.WithoutCancel(ctx), st, r); err != nil {
			finishErr = errors.Join(finishErr, err)
		}
	}
	return len(states), finishErr
}

// sync は、カレンダー st の変わった予定を読み、1 つずつトランザクションで当てる。
// 当てられなかった予定があれば、トークンを進めずに返し、次に同じ予定から読み直す。
func (s *Syncer) sync(ctx context.Context, st SyncState) SyncResult {
	attrs := []any{slog.String("external_calendar_id", st.Calendar.ID)}
	token := st.SyncToken
	src, err := s.deps.Sources(ctx, st.Calendar.FacilityID)
	if err == nil && src == nil {
		err = ErrNotConfigured
	}
	if err != nil {
		s.log.ErrorContext(ctx, "calendar sync source", append(attrs, slog.Any("error", err))...)
		code := SyncUnavailable
		return SyncResult{SyncToken: token, Status: SyncFailed, ErrorCode: &code, After: s.interval}
	}
	ch, err := src.Changes(ctx, st.Calendar.CalendarID, token)
	if errors.Is(err, ErrSyncTokenExpired) {
		s.log.InfoContext(ctx, "calendar sync token expired", attrs...)
		token = ""
		ch, err = src.Changes(ctx, st.Calendar.CalendarID, "")
	}
	if err != nil {
		s.log.WarnContext(ctx, "calendar sync failed", append(attrs, slog.Any("error", err))...)
		code := SyncUnavailable
		if errors.Is(err, ErrUnreadable) {
			code = SyncUnreadable
		}
		return SyncResult{SyncToken: token, Status: SyncFailed, ErrorCode: &code, After: s.interval}
	}
	for _, ev := range ch.Events {
		err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
			return s.apply.applyEvent(ctx, st.Calendar, ev)
		})
		if errors.Is(err, errExportWriting) {
			return SyncResult{SyncToken: token, Status: st.LastStatus, ErrorCode: st.LastError, After: syncRetryAfter}
		}
		if err != nil {
			s.log.ErrorContext(ctx, "calendar sync failed", append(attrs, slog.String("event_id", ev.ID), slog.Any("error", err))...)
			code := SyncApplyFailed
			return SyncResult{SyncToken: token, Status: SyncFailed, ErrorCode: &code, After: s.interval}
		}
	}
	return SyncResult{SyncToken: ch.NextSyncToken, Status: SyncSucceeded, After: s.interval}
}
