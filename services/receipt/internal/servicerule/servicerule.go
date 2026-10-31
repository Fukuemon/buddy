// Package servicerule は、サービス内容ごとの、訪問の時間の許容範囲を持つ。
// サービス内容は normalize で正規化した後の値を受ける。
package servicerule

import (
	"fmt"
	"strings"
)

// Range は、許容する分の範囲である。両端を含む。
type Range struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// Contains は、minutes が範囲に入るかを返す。
func (r Range) Contains(minutes int) bool {
	return r.Min <= minutes && minutes <= r.Max
}

// String は、`20~29` の形で返す。
func (r Range) String() string {
	return fmt.Sprintf("%d~%d", r.Min, r.Max)
}

// Base は、サービス内容の末尾の夜間・早朝の加算の「・夜」と、深夜の加算の「・深」を外した値を返す。
// 「・夜」と「・深」の付くサービスコードは、付かないサービスコードと同じ提供時間の区分である。
func Base(service string) string {
	for _, suffix := range []string{"・夜", "・深"} {
		if s, ok := strings.CutSuffix(service, suffix); ok {
			return s
		}
	}
	return service
}

// Lookup は、サービス内容の許容範囲を返す。
// `基本療養費` か `難病等複数回訪問` を含むサービス内容は、その語の範囲を使う。
// ほかのサービス内容は、Base で「・夜」と「・深」を外してから表を引く。
// 範囲を持たないサービス内容なら ok は false である。
func Lookup(service string) (r Range, ok bool) {
	switch {
	case strings.Contains(service, "基本療養費"):
		service = "基本療養費"
	case strings.Contains(service, "難病等複数回訪問"):
		service = "難病等複数回訪問加算(２回)"
	}
	switch Base(service) {
	case "訪看I２", "予防看I２", "予訪看I２", "予防訪看I２":
		return Range{20, 29}, true
	case "訪看I３", "予防看I３", "予訪看I３", "予防訪看I３":
		return Range{30, 59}, true
	case "訪看I４", "予防看I４", "予訪看I４", "予防訪看I４":
		return Range{60, 89}, true
	case "訪看I５", "予防看I５", "予訪看I５", "予防訪看I５":
		return Range{21, 40}, true
	case "訪看I５・２超", "訪看I５２超", "予防看I５・２超", "予訪看I５・２超", "予防訪看I５・２超", "予防訪看I５２超":
		return Range{41, 60}, true
	case "基本療養費", "医", "難病等複数回訪問加算(２回)":
		return Range{30, 90}, true
	}
	return Range{}, false
}

// AdjustsScheduleEnd は、予定の終了時間と提供時間から 1 分引くサービス内容かを返す。
// Base で「・夜」と「・深」を外してから判定する。
func AdjustsScheduleEnd(service string) bool {
	switch Base(service) {
	case "訪看I２", "予防看I２", "予訪看I２", "予防訪看I２",
		"訪看I３", "予防看I３", "予訪看I３", "予防訪看I３",
		"訪看I４", "予防看I４", "予訪看I４", "予防訪看I４":
		return true
	}
	return false
}

// ServiceMatches は、予定と実績のサービス内容が対応するかを返す。
// 両側を Base で「・夜」と「・深」を外してから比べる。加算が時間帯に合うかは judge が判定する。
// 予定の `医` は、実績の `基本療養費` か `難病等複数回訪問` を含むサービス内容に対応する。
func ServiceMatches(schedule, visit string) bool {
	if Base(schedule) == Base(visit) {
		return true
	}
	return schedule == "医" &&
		(strings.Contains(visit, "基本療養費") || strings.Contains(visit, "難病等複数回訪問"))
}
