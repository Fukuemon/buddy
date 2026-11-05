// Package servicecode は、訪問の予定と利用者に付けるレセプトのサービスコードのマスタと、その操作を持つ（ADR-0025）。
// サービス内容の表記の規則と提供時間の範囲の表は、共有の module の packages/go/servicecode にある。
package servicecode

// ServiceCode は、レセプトのサービスコードである。StartMinutes と EndMinutes は、対象の提供時間の範囲である。
type ServiceCode struct {
	ID           string
	Code         string
	StartMinutes int
	EndMinutes   int
}
