package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
)

// syncPollTick は、常駐の同期が、読む時刻を過ぎたカレンダーがあるかを確認する間隔の上限である。
// カレンダーを読む間隔は、Syncer がカレンダーごとに書く次に読む時刻（GOOGLE_CALENDAR_SYNC_INTERVAL）で決まる。
const syncPollTick = 5 * time.Second

// pollInterval は、役割 name の常駐が、取れるものが無くなってから次に取りに行くまでの間隔を返す。
// 書き出しは GOOGLE_CALENDAR_EXPORT_INTERVAL、同期は GOOGLE_CALENDAR_SYNC_INTERVAL と syncPollTick の短い方である。
func pollInterval(name string, c config.Calendar) time.Duration {
	if name == "sync" {
		return min(c.SyncInterval, syncPollTick)
	}
	return c.ExportInterval
}

// dueFunc は、取れるものを 1 回の上限まで取って処理し、取った数を返す処理（Exporter.ExportDue、Syncer.SyncDue）である。
type dueFunc func(context.Context) (int, error)

// resident は、ctx が終わるまで、drain で取れるものが無くなるまで due を呼んでから、interval を待つことを繰り返す（ADR-0025）。
// 待ちとカレンダーを取れなかったときは、ログに書き、interval を待ってから取り直す。
func resident(ctx context.Context, due dueFunc, interval time.Duration, log *slog.Logger) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		if _, err := drain(ctx, due, 0, log); err != nil {
			log.ErrorContext(ctx, "calendar worker batch", slog.Any("error", err))
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// drain は、due を、何も取らなくなるか、ctx が終わるか、始めてから maxDuration が過ぎるまで繰り返し、取った数の和を返す。
// maxDuration が 0 なら長さで止めない。止める条件は due を呼ぶ前に確認し、呼んだ due は取ったものの結果を書くまで待つ。
// due が何も取らずにエラーを返したら（待ちとカレンダーを取れなかったら）、そのエラーを返す。ctx が終わった後のエラーは返さない。
// 取った後のエラー（結果を書けなかった）は、ログに書いて続ける。
func drain(ctx context.Context, due dueFunc, maxDuration time.Duration, log *slog.Logger) (int, error) {
	start := time.Now()
	total := 0
	for ctx.Err() == nil && (maxDuration == 0 || time.Since(start) < maxDuration) {
		n, err := due(ctx)
		total += n
		switch {
		case err != nil && n == 0:
			if ctx.Err() != nil {
				return total, nil
			}
			return total, err
		case err != nil:
			log.ErrorContext(ctx, "calendar worker batch", slog.Any("error", err))
		case n == 0:
			return total, nil
		}
	}
	return total, nil
}
