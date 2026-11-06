package calendarsync

import (
	"context"
	"errors"
	"log/slog"
	"strconv"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// 読み戻しの上限と間隔。
const (
	// readBackBatch は、1 回に取る記録の数の上限である。
	readBackBatch = 10
	// readBackTimeout は、1 つの記録の予定を Google から読んで、保留の版を解く時間の上限である。
	readBackTimeout = 30 * time.Second
	// readBackLease は、取った記録をほかの処理に渡さない時間である。readBackBatch 件を readBackTimeout で終えても超えない長さにする。
	// 読めなかった記録は、この時間の後に取り直す。
	readBackLease = 6 * time.Minute
)

// ReadBackDue は、Applier のあるモードの事業所の、書く期限を過ぎた保留の版を持つ記録を取り、予定を Google から読み戻して
// 保留の版を確定するか消し（ADR-0026）、取った記録の数を返す。「結果が分からない」と、期限を過ぎた「書いている途中」の両方を取る。
// 書く期限の後に読むので、その書き込みがまだ Google に届く途中であることはない。
//   - 予定の buddy の予定の ID と版が保留の版と同じ: calendar.ConfirmPending で確定し、読んだ予定を Applier で Projection に写す。
//   - 版か buddy の予定の ID が違うか、予定が取り消されている: calendar.RejectPending で保留の版を消し、読んだ予定を Projection に写す。
//   - 予定が無い: 保留の版を消す。Google はカレンダーを読めないときも 404 を返すので、カレンダーを読めることを確認してから消す。
//   - 読めない: 記録を変えず、readBackLease の後に取り直す。
//
// 保留の版を解くトランザクションでは、同期と同じく事業所の行を共有のロックで読み、カレンダーを外したか、職員が退職したか、
// モードの Applier が無ければ、記録を変えない。読み戻しの間に、予定の API の送り直しが保留の版を解いていれば、記録を変えない。
// 取った後は、結果ごとの数の要約（calendar pending readback batch）をログに書く。
func (s *Syncer) ReadBackDue(ctx context.Context) (int, error) {
	start := time.Now()
	checks, err := s.deps.Records.ClaimExpired(ctx, s.deps.Now(), readBackBatch, readBackLease, s.modes)
	if err != nil {
		return 0, err
	}
	b := calendar.Batch{Claimed: len(checks)}
	defer func() { b.Log(ctx, s.log, "calendar pending readback batch", time.Since(start)) }()
	var releaseErr error
	for _, p := range checks {
		callCtx, cancel := context.WithTimeout(ctx, readBackTimeout)
		o := s.readBack(callCtx, p)
		cancel()
		// 止める合図で解けなかった記録は、次に起動したときにすぐ取れるように戻す。
		if ctx.Err() != nil && o != outcomeSynced {
			o = outcomeRequeued
			if err := s.deps.Records.Release(context.WithoutCancel(ctx), p); err != nil {
				releaseErr = errors.Join(releaseErr, err)
			}
		}
		o.count(&b)
	}
	return len(checks), releaseErr
}

// readBack は、記録 p の予定を Google から読み、保留の版を解く。
func (s *Syncer) readBack(ctx context.Context, p PendingCheck) outcome {
	attrs := []any{
		slog.String("facility_id", p.Calendar.FacilityID), slog.String("external_calendar_id", p.Calendar.ID),
		slog.String("event_id", p.Record.ExternalEventID),
	}
	readAt := time.Now()
	ev, found, err := s.readEvent(ctx, p)
	if err != nil {
		s.log.WarnContext(ctx, "calendar pending readback failed", append(attrs, slog.Any("error", err))...)
		return outcomeFailed
	}
	version := p.Record.Pending.Version
	accepted := found && ev.Status != calendar.StatusCancelled &&
		ev.Private[calendar.PropScheduleID] == p.Record.ScheduleID && ev.Private[calendar.PropVersion] == strconv.Itoa(version)
	ev = stampCancellation(ev, readAt)
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		a, err := s.applierFor(ctx, p.Calendar)
		if err != nil {
			return err
		}
		rec, ok, err := calendar.LockPending(ctx, s.deps.Records, p.Record.ScheduleID, version)
		if err != nil || !ok || rec.ExternalCalendarID != p.Calendar.ID || rec.ExternalEventID != p.Record.ExternalEventID ||
			!sameAttempt(*rec.Pending, *p.Record.Pending) {
			return err
		}
		if accepted {
			err = calendar.ConfirmPending(ctx, s.deps.Records, s.deps.Visits, rec)
		} else {
			err = calendar.RejectPending(ctx, s.deps.Records, s.deps.Visits, rec)
		}
		if err != nil || !found {
			return err
		}
		return a.Apply(ctx, p.Calendar, ev)
	})
	switch {
	case err == nil:
		return outcomeSynced
	case errors.Is(err, errCalendarUnlinked), errors.Is(err, errModeChanged):
		return outcomeHeld
	}
	s.log.ErrorContext(ctx, "calendar pending readback failed", append(attrs, slog.Any("error", err))...)
	return outcomeFailed
}

// sameAttempt は、読み直した保留の版 cur が、読み戻しで取った保留の版 claimed と同じ書き込みかを返す。
// 版の番号だけでは見分けられない。読み戻しの間に、送り直しが記録を消して同じ予定の ID で作り直すと、版の番号は 1 に戻るためである。
// 書く期限と保留の訪問の情報は、書き込みごとに新しくなる。
func sameAttempt(cur, claimed calendar.PendingWrite) bool {
	return cur.Version == claimed.Version && cur.Deadline.Equal(claimed.Deadline) &&
		(cur.VisitInfoID == nil) == (claimed.VisitInfoID == nil) && (cur.VisitInfoID == nil || *cur.VisitInfoID == *claimed.VisitInfoID)
}

// readEvent は、記録 p の予定を Google から読む。予定が無ければ、found を false にしてエラーを返さない。
// 予定が無いと答えたときは、カレンダーを読めることを確認し、読めなければそのエラーを返す。
func (s *Syncer) readEvent(ctx context.Context, p PendingCheck) (calendar.Event, bool, error) {
	src, err := s.deps.Sources(ctx, p.Calendar.FacilityID)
	if err == nil && src == nil {
		err = calendar.ErrNotConfigured
	}
	if err != nil {
		return calendar.Event{}, false, err
	}
	ev, err := src.Event(ctx, p.Calendar.CalendarID, p.Record.ExternalEventID)
	if errors.Is(err, calendar.ErrEventNotFound) {
		if err := src.Check(ctx, p.Calendar.CalendarID); err != nil {
			return calendar.Event{}, false, err
		}
		return calendar.Event{}, false, nil
	}
	if err != nil {
		return calendar.Event{}, false, err
	}
	return ev, true, nil
}
