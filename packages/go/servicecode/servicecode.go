// Package servicecode は、訪問看護のサービス内容の表記と、サービス内容ごとの提供時間の範囲を持つ（ADR-0022）。
// 照合の API と予定の API が、同じ表と同じ表記の規則を使うために共有する。報酬の改定で変わる規則は、このパッケージだけで直す。
package servicecode

import (
	"fmt"
	"strings"
)

// Normalize は、サービス内容の表記をそろえる。
// 全角スペースを半角にし、`Ⅰ` `１` `1` を `I` に、`･` を `・` に、残った半角数字を全角にする。
func Normalize(s string) string {
	s = strings.ReplaceAll(s, "　", " ")
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == 'Ⅰ' || r == '１' || r == '1':
			b.WriteRune('I')
		case r == '･':
			b.WriteRune('・')
		case '0' <= r && r <= '9':
			b.WriteRune(r - '0' + '０')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

var aliases = strings.NewReplacer("予防訪看", "予防看", "予訪看", "予防看", "I５２超", "I５・２超")

// Canonical は、Normalize でそろえたサービス内容 s の別の表記（`予防訪看`、`予訪看`、`I５２超`）を、
// 予定の API のマスタのサービスコードの表記（`予防看`、`I５・２超`）にそろえる。
func Canonical(s string) string {
	return aliases.Replace(s)
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

// Range は、許容する分の範囲である。両端を含む。
type Range struct {
	Min int
	Max int
}

// Contains は、minutes が範囲に入るかを返す。
func (r Range) Contains(minutes int) bool {
	return r.Min <= minutes && minutes <= r.Max
}

// String は、`20~29` の形で返す。
func (r Range) String() string {
	return fmt.Sprintf("%d~%d", r.Min, r.Max)
}

// ranges は、Canonical の表記のサービス内容ごとの提供時間の範囲である。予定の API のシードの service_codes と同じ値にする。
var ranges = map[string]Range{
	"訪看I２":           {20, 29},
	"予防看I２":          {20, 29},
	"訪看I３":           {30, 59},
	"予防看I３":          {30, 59},
	"訪看I４":           {60, 89},
	"予防看I４":          {60, 89},
	"訪看I５":           {21, 40},
	"予防看I５":          {21, 40},
	"訪看I５・２超":        {41, 60},
	"予防看I５・２超":       {41, 60},
	"医":              {30, 90},
	"基本療養費":          {30, 90},
	"難病等複数回訪問加算(２回)": {30, 90},
}

// TimeClass は、Normalize でそろえたサービス内容 service の提供時間の区分（`I２`、`I５・２超` など）を返す。
// 訪問看護（`訪看`）と介護予防（`予防看` とその別の表記）のサービス内容で、範囲の表にあるものだけが区分を持つ。
// 範囲の表にあっても、医療保険の項目（`医`、`基本療養費`、`難病等複数回訪問加算(２回)`）は区分を持たない。区分を持たなければ ok は false である。
// Base で「・夜」と「・深」を外してから判定する。
func TimeClass(service string) (class string, ok bool) {
	s := Canonical(Base(service))
	if _, known := ranges[s]; !known {
		return "", false
	}
	for _, prefix := range []string{"訪看", "予防看"} {
		if c, ok := strings.CutPrefix(s, prefix); ok {
			return c, true
		}
	}
	return "", false
}

// Lookup は、Normalize でそろえたサービス内容 service の提供時間の範囲を返す。範囲を持たないサービス内容なら ok は false である。
// `基本療養費` か `難病等複数回訪問` を含むサービス内容は、その語の範囲を使う。
// ほかのサービス内容は、Base で「・夜」と「・深」を外し、Canonical で別の表記をそろえてから表を引く。
func Lookup(service string) (r Range, ok bool) {
	switch {
	case strings.Contains(service, "基本療養費"):
		service = "基本療養費"
	case strings.Contains(service, "難病等複数回訪問"):
		service = "難病等複数回訪問加算(２回)"
	}
	r, ok = ranges[Canonical(Base(service))]
	return r, ok
}
