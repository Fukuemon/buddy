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

// Elapsed は、終了時間から開始時間を引いた分を返す。
func (r Record) Elapsed() int {
	return int(r.End - r.Start)
}

// AdditionText は、Additions を ", " でつないだ文字列を返す。
func (r Record) AdditionText() string {
	return strings.Join(r.Additions, ", ")
}

// RowError は、入力の 1 行のエラーである。
type RowError struct {
	Source  Source `json:"source"`
	Line    int    `json:"line"`
	Column  string `json:"column,omitempty"`
	Message string `json:"message"`
}

// InputError は、入力のファイルを照合に使えないことを表す。
// Rows が空でなければ、行ごとのエラーを持つ。
type InputError struct {
	Message string
	Rows    []RowError
}

func (e *InputError) Error() string {
	if len(e.Rows) == 0 {
		return e.Message
	}
	return fmt.Sprintf("%s（%d 件の行のエラー）", e.Message, len(e.Rows))
}

// Warning は、予定のデータソースが解釈できず、照合に使わなかった予定の 1 件である。
// 利用者名を含むので、予定のタイトルは持たない。
type Warning struct {
	CalendarID string `json:"calendar_id"`
	EventID    string `json:"event_id"`
	// Start は、予定の開始の日時（RFC 3339）である。
	Start   string `json:"start"`
	Message string `json:"message"`
}
