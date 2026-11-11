package calendarimport

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// CutoverRepository は、移行の記録と、移行の取り込みで選んだ取り込まない予定を読み書きし、移行の取り込みで作った予定を消す。
// 見つからないときは apperr.ErrNotFound を返す。
type CutoverRepository interface {
	// Create は、open の移行 c を書く。開始の時刻は DB が決める。事業所に open の移行があるときは apperr.ErrConflict を返す。
	Create(ctx context.Context, c Cutover) error
	Get(ctx context.Context, id string) (Cutover, error)
	// FindOpen は、事業所 facilityID の open の移行を返す。
	FindOpen(ctx context.Context, facilityID string) (Cutover, error)
	// Finish は、open の移行 id を status にし、終えた時刻を入れて返す。open でなければ apperr.ErrNotFound を返す。
	Finish(ctx context.Context, id string, status CutoverStatus) (Cutover, error)
	// ListLatestRuns は、移行 cutoverID の取り込みのうち、カレンダーごとに最も新しく終えた成功した取り込みを返す。
	ListLatestRuns(ctx context.Context, cutoverID string) ([]calendar.ImportRun, error)
	// ReplaceSkips は、移行 cutoverID のカレンダー externalCalendarID の取り込まない予定の記録を、skips に置き換える。
	ReplaceSkips(ctx context.Context, cutoverID, externalCalendarID string, skips []CutoverSkip) error
	// ListSkips は、移行 cutoverID のカレンダー externalCalendarID の取り込まない予定の記録を返す。
	ListSkips(ctx context.Context, cutoverID, externalCalendarID string) ([]CutoverSkip, error)
	// ListLinks は、移行 cutoverID の取り込みで作った予定の対応を返す。
	ListLinks(ctx context.Context, cutoverID string) ([]calendar.EventLink, error)
	// CountPendingRecords は、事業所 facilityID の、予定の API が Google カレンダーに書いた予定の記録（calendar.EventRecord）のうち、
	// 保留の版を持つ記録の数を返す。
	CountPendingRecords(ctx context.Context, facilityID string) (int, error)
	// ListRecordVisits は、カレンダー externalCalendarID の記録のうち、Google が受けたと分かった版（確定した版）を持つ記録の
	// 訪問の情報を、Google の予定の ID ごとに返す。保留の版の訪問の情報は返さない。
	// 訪問の情報を持たない確定した記録（通常の予定）は、ID の空の visit.Info を返す。
	ListRecordVisits(ctx context.Context, externalCalendarID string) (map[string]visit.Info, error)
	// DeleteRecords は、事業所 facilityID の記録を全て消し、記録が指していた訪問の情報（確定した版と保留の版）のうち、
	// どの予定、繰り返しの予定、記録も指さなくなったものを消す。トランザクションの中で呼ぶ。
	DeleteRecords(ctx context.Context, facilityID string) error
	// DeleteImported は、予定の対応 links と、対応する単発の予定と繰り返しの予定と、それらの訪問の情報を消す。
	// 繰り返しの予定の回を置き換えた予定も消す。予定のキャンセル、除外する日、書き出しの待ちも一緒に消える。トランザクションの中で呼ぶ。
	DeleteImported(ctx context.Context, links []calendar.EventLink) error
}
