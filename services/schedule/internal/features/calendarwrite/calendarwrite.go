// Package calendarwrite は、Google カレンダーを予定の正本にする事業所（google_primary）で、職員が buddy から作り、変え、取り消す予定を、
// リクエストの中で Google カレンダーに書く（ADR-0026）。書いた予定の訪問の情報と書き込みの保留の版は、記録（calendar.EventRecord）に持つ。
// 予定の閲覧と編集の判定、訪問の情報の規則は schedule の規則を使い、予定の本文と Projection の行は calendar の規則で作る。
package calendarwrite

import (
	"errors"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// Google を呼ぶ時間の上限と、書く期限（ADR-0026）。
const (
	// CallTimeout は、1 回の Google の呼び出し（作成、変更、削除か読み出し）を待つ時間の上限である。過ぎたら結果が分からないとみなす。
	CallTimeout = 20 * time.Second
	// WriteDeadline は、保留の版を書いてから書く期限までの長さである。手順 1 の後に Google を呼び、2 つ目のトランザクションを終えるまでを収める。
	// 呼ぶ回数は、作成で 2 回（作成と読み出し）、予定を別のカレンダーに移す変更で 4 回（読み出し、作成、削除、読み出し）までで、
	// CallTimeout の 4 回分に余裕を足して収める。期限を過ぎた「書いている途中」の保留の版は、
	// 予定の API が止まったものとみなす。
	WriteDeadline = 2 * time.Minute
)

// 409 の原因の code。httpapi が 409 のレスポンスの code にする。
const (
	// CodeCalendarNotLinked は、予定の職員に外していないカレンダーが無いことを表す。
	CodeCalendarNotLinked = "calendar_not_linked"
	// CodeCutoverOpen は、事業所が予定の正本を buddy に切り替えている（open の切り替えがある）ことを表す。calendarimport と同じ code である。
	CodeCutoverOpen = "cutover_open"
	// CodeWritePending は、予定に書き込みの保留の版があり、その書き込みが終わっていないことを表す。
	CodeWritePending = "google_write_pending"
	// CodeEventChanged は、Google カレンダーの予定が、送った内容と違うことを表す。
	CodeEventChanged = "google_event_changed"
	// CodeEventNotFound は、Google カレンダーで予定が消されたか見つからないことを表す。
	CodeEventNotFound = "google_event_not_found"
	// CodeCalendarUnwritable は、事業所のサービスアカウントがカレンダーに予定を書けないことを表す。
	CodeCalendarUnwritable = "google_calendar_unwritable"
	// CodeEventRejected は、Google カレンダーが予定の内容を受け付けなかったことを表す。
	CodeEventRejected = "google_event_rejected"
)

// 503 になるエラー。httpapi が状態コードと code に対応させる。
var (
	// ErrWriteUnknown は、Google が書き込みを受けたかが分からないことを表す。保留の版を残す。code は google_write_unknown である。
	ErrWriteUnknown = errors.New("予定を Google カレンダーに書けたかを確認できませんでした。時間をおいて予定を開き直してください")
	// ErrGoogleUnavailable は、Google が一時的に書き込みを拒んだことを表す。保留の版を消す。code は google_unavailable である。
	ErrGoogleUnavailable = errors.New("予定を Google カレンダーに書けませんでした。時間をおいてやり直してください")
)

var (
	errNotGooglePrimary  = apperr.Conflict("この事業所の予定の正本が変わりました。画面を開き直してください")
	errCutoverOpen       = apperr.ConflictCode(CodeCutoverOpen, "この事業所では予定の正本を切り替えています。切り替えの間は予定を作成、変更、取り消しできません")
	errCalendarNotLinked = apperr.ConflictCode(CodeCalendarNotLinked, "予定の職員が Google カレンダーを結び付けていません。カレンダーを結び付けてから予定を作ってください")
	errWritePending      = apperr.ConflictCode(CodeWritePending, "この予定は Google カレンダーに書いている途中です。時間をおいて予定を開き直してください")
	errIDTaken           = apperr.Conflict("この予定の ID は、ほかの予定に使われています")
	errEventChanged      = apperr.ConflictCode(CodeEventChanged, "Google カレンダーで予定が変わっていました。最新の予定を確認してください")
	errEventNotFound     = apperr.ConflictCode(CodeEventNotFound, "Google カレンダーで予定が見つかりません")
	errUnwritable        = apperr.ConflictCode(CodeCalendarUnwritable, "%s", calendar.ErrUnwritable)
	errEventRejected     = apperr.ConflictCode(CodeEventRejected, "Google カレンダーが予定を受け付けませんでした。入力を確認してください")
	errRecurring         = apperr.Conflict("繰り返しの予定の全体は、まだ buddy から変えられません。Google カレンダーで変更してください")
	errOccurrenceMove    = apperr.Conflict("繰り返しの予定の回の職員は、まだ buddy から替えられません。Google カレンダーで変更してください")
	errReplaced          = apperr.Conflict("この回はすでに変えられています。変えた回の予定を開き直してください")
)
