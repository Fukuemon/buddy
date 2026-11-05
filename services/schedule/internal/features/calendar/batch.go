package calendar

import (
	"context"
	"log/slog"
	"time"
)

// Batch は、書き出しか同期の処理が 1 回に取った待ちかカレンダー（1 つのバッチ）の結果ごとの数である（ADR-0029）。
// Succeeded、Failed、Held、Requeued の和は Claimed になる。
type Batch struct {
	// Claimed は、取った数である。
	Claimed int
	// Succeeded は、書けたか、当て終えた数である。
	Succeeded int
	// Failed は、書けなかったか、読めなかったか当てられなかった数である。後で書き直すか読み直すものも含む。
	Failed int
	// Held は、書かずに確認が必要な待ち（conflict）にしたか、当てずに置いた（書き出しを待って読み直すか、途中でカレンダーが外れた）数である。
	Held int
	// Requeued は、止める合図で、結果を書かずにほかの処理が取り直せるように戻した数である。
	Requeued int
}

// Log は、バッチの要約を、msg の 1 行のログに書く。取った数が 0 のバッチは、常駐の間隔ごとに続くので Debug で書く。
// メトリクスはこのログからインフラの側で作るので、項目の名前を変えるときは context/operations.md も直す。
func (b Batch) Log(ctx context.Context, log *slog.Logger, msg string, elapsed time.Duration) {
	level := slog.LevelInfo
	if b.Claimed == 0 {
		level = slog.LevelDebug
	}
	log.LogAttrs(ctx, level, msg,
		slog.Int("claimed_count", b.Claimed),
		slog.Int("succeeded_count", b.Succeeded),
		slog.Int("failed_count", b.Failed),
		slog.Int("held_count", b.Held),
		slog.Int("requeued_count", b.Requeued),
		slog.Int64("duration_ms", elapsed.Milliseconds()),
	)
}
