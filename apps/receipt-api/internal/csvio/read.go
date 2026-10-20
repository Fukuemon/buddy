// Package csvio は、照合の入力の CSV を読み、結果を CSV に書く。
package csvio

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/japanese"

	"github.com/Fukuemon/buddy/apps/receipt-api/internal/record"
)

const utf8BOM = "\xEF\xBB\xBF"

// 入力の列の名前。
const (
	ColDate     = "訪問日"
	ColClient   = "利用者名"
	ColStart    = "開始時間"
	ColEnd      = "終了時間"
	ColDuration = "提供時間"
	ColService  = "サービス内容"
	ColStaff    = "主訪問者"
)

// AdditionColumns は、実績の CSV の加算の列を、つなぐ順に返す。
func AdditionColumns() []string {
	return []string{"加算①", "加算②", "加算③", "加算④", "加算⑤"}
}

// ScheduleColumns は、予定の CSV に要る列を返す。
func ScheduleColumns() []string {
	return []string{ColDate, ColClient, ColStart, ColEnd, ColDuration, ColService, ColStaff}
}

// VisitColumns は、実績（iBow の出力）の CSV に要る列を返す。
func VisitColumns() []string {
	return append(ScheduleColumns(), AdditionColumns()...)
}

// Row は、CSV の 1 行のうち、要る列だけを名前で引けるようにしたものである。
type Row struct {
	Line   int
	values map[string]string
}

// Get は、列の値を返す。読んでいない列なら空文字列を返す。
func (r Row) Get(column string) string {
	return r.values[column]
}

// NewRow は、line 行目の列の値から Row を作る。
func NewRow(line int, values map[string]string) Row {
	return Row{Line: line, values: values}
}

// Decode は、UTF-8（BOM の有無を問わない）か CP932 のバイト列を UTF-8 の文字列にする。
// どちらとしても読めなければ *record.InputError を返す。
func Decode(data []byte) (string, error) {
	if b, ok := bytes.CutPrefix(data, []byte(utf8BOM)); ok {
		if !utf8.Valid(b) {
			return "", &record.InputError{Message: "UTF-8 として読めないバイト列がある"}
		}
		return string(b), nil
	}
	if utf8.Valid(data) {
		return string(data), nil
	}
	s, err := japanese.ShiftJIS.NewDecoder().Bytes(data)
	if err != nil || bytes.ContainsRune(s, utf8.RuneError) {
		return "", &record.InputError{Message: "文字コードが UTF-8 でも CP932 でもない"}
	}
	return string(s), nil
}

// ReadTable は、CSV を読み、columns の列を持つ行を返す。
// 先頭の行をヘッダーとして扱い、columns のうちヘッダーにない列があれば *record.InputError を返す。
// columns の値がすべて空の行は読み飛ばす。
func ReadTable(data []byte, source record.Source, columns []string) ([]Row, error) {
	text, err := Decode(data)
	if err != nil {
		return nil, err
	}
	r := csv.NewReader(strings.NewReader(text))
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if errors.Is(err, io.EOF) {
		return nil, &record.InputError{Message: fmt.Sprintf("%s の CSV が空である", source)}
	}
	if err != nil {
		return nil, csvError(source, err)
	}
	index := make(map[string]int, len(header))
	for i, h := range header {
		index[strings.TrimSpace(h)] = i
	}
	var missing []string
	for _, c := range columns {
		if _, ok := index[c]; !ok {
			missing = append(missing, c)
		}
	}
	if len(missing) > 0 {
		return nil, &record.InputError{
			Message: fmt.Sprintf("%s の CSV に列がない: %s", source, strings.Join(missing, ", ")),
		}
	}

	var rows []Row
	for {
		fields, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, csvError(source, err)
		}
		line, _ := r.FieldPos(0)
		values := make(map[string]string, len(columns))
		blank := true
		for _, c := range columns {
			var v string
			if i := index[c]; i < len(fields) {
				v = fields[i]
			}
			values[c] = v
			if strings.TrimSpace(v) != "" {
				blank = false
			}
		}
		if !blank {
			rows = append(rows, Row{Line: line, values: values})
		}
	}
	return rows, nil
}

func csvError(source record.Source, err error) error {
	var pe *csv.ParseError
	if errors.As(err, &pe) {
		return &record.InputError{
			Message: fmt.Sprintf("%s の CSV を読めない", source),
			Rows:    []record.RowError{{Source: source, Line: pe.Line, Message: pe.Err.Error()}},
		}
	}
	return &record.InputError{Message: fmt.Sprintf("%s の CSV を読めない: %v", source, err)}
}
