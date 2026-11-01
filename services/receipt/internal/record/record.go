// Package record は、正規化した後の訪問の 1 行と、入力の行のエラーを表す。
package record

import (
	"fmt"
	"strings"

	"github.com/Fukuemon/buddy/services/receipt/internal/civil"
)

// Source は、行がどちらの入力から来たかを表す。
type Source string

// 入力の種類。
const (
	SourceSchedule Source = "schedules"
	SourceVisit    Source = "visits"
)

// Key は、予定と実績を突き合わせるキーである。
type Key struct {
	Date   civil.Date
	Client string
	Staff  string
}

// Record は、予定か実績の 1 行である。
type Record struct {
	// Line は、入力の CSV の行番号（ヘッダーが 1 行目）である。CSV 以外から来た行では 0 にする。
	Line    int
	Key     Key
	Start   civil.Clock
	End     civil.Clock
	Service string
	// Duration は提供時間（分）である。入力が空なら nil にする。
	Duration *int
	// Additions は、実績の加算①〜加算⑤のうち空でない値を、列の順に並べたものである。予定では nil である。
	Additions []string
}

// Elapsed は、終了時間から開始時間を引いた分を返す。終了時間が開始時間より前の行は、翌日の終了時間までの分にする（ADR-0023）。
func (r Record) Elapsed() int {
	return r.Start.MinutesUntil(r.End)
}

// AdditionText は、Additions を ", " でつないだ文字列を返す。
func (r Record) AdditionText() string {
	return strings.Join(r.Additions, ", ")
}

// Reason は、入力のファイルか行か予定を照合に使えない理由である。
// 画面は、Reason と列と行から職員に見せる文を作る。Message は画面に出さない。
type Reason string

// 照合に使えない理由。
const (
	// ReasonEncoding は、文字コードが UTF-8 でも CP932 でもないファイルである。
	ReasonEncoding Reason = "encoding"
	// ReasonEmptyFile は、ヘッダーの行も無いファイルである。
	ReasonEmptyFile Reason = "empty_file"
	// ReasonMissingColumn は、ヘッダーに要る列が無いファイルである。列ごとに 1 件にする。
	ReasonMissingColumn Reason = "missing_column"
	// ReasonMalformedRow は、引用符の閉じ忘れのように、CSV として読めない行である。
	ReasonMalformedRow Reason = "malformed_row"
	// ReasonEmptyValue は、要る値が空の列である。
	ReasonEmptyValue Reason = "empty_value"
	// ReasonInvalidDate は、日付として読めない値か、暦に無い日付である。
	ReasonInvalidDate Reason = "invalid_date"
	// ReasonInvalidTime は、時刻として読めない値である。
	ReasonInvalidTime Reason = "invalid_time"
	// ReasonInvalidDuration は、0 以上の整数でない提供時間である。
	ReasonInvalidDuration Reason = "invalid_duration"
	// ReasonUnreadableTitle は、タイトルを `【サービス内容】利用者名` の形として読めない予定である。
	ReasonUnreadableTitle Reason = "unreadable_title"
	// ReasonUnreadableTime は、開始か終了の日時を読めない予定である。
	ReasonUnreadableTime Reason = "unreadable_time"
	// ReasonSpansDays は、日付をまたぐ予定である。
	ReasonSpansDays Reason = "spans_days"
)

// CSVError は、入力の CSV の誤りの 1 件である。
type CSVError struct {
	Source Source `json:"source"`
	Reason Reason `json:"reason"`
	// Line は、入力の CSV の行番号（ヘッダーが 1 行目）である。ファイルの全体の誤りでは 0 にする。
	Line int `json:"line,omitempty"`
	// Column は、誤りのある列の名前である。列を決められない誤りでは空にする。
	Column  string `json:"column,omitempty"`
	Message string `json:"message"`
}

// InputError は、入力のファイルを照合に使えないことを表す。Errors は 1 件以上ある。
type InputError struct {
	Message string
	Errors  []CSVError
}

func (e *InputError) Error() string {
	return fmt.Sprintf("%s（%d 件の誤り）", e.Message, len(e.Errors))
}

// Warning は、予定のデータソースが解釈できず、照合に使わなかった予定の 1 件である。
// 利用者名を含むので、予定のタイトルは持たない。
type Warning struct {
	CalendarID string `json:"calendar_id"`
	EventID    string `json:"event_id"`
	// Start は、予定の開始の日時（RFC 3339）である。
	Start  string `json:"start"`
	Reason Reason `json:"reason"`
	// Column は、Reason が列の値の誤りのときの列の名前である。
	Column  string `json:"column,omitempty"`
	Message string `json:"message"`
}
