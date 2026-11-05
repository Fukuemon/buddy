// Package servicerule は、照合だけが使うサービス内容の規則を持つ。
// サービス内容の表記と提供時間の範囲は、予定の API と共有する packages/go/servicecode が持つ（ADR-0016）。
// サービス内容は normalize で正規化した後の値を受ける。
package servicerule

import (
	"strings"

	"github.com/Fukuemon/buddy/packages/go/servicecode"
)

// HasScheduleEndAdjustment は、予定の終了時間と提供時間から 1 分引くサービス内容（Ⅰ２ からⅠ４）かを返す。
// 区分は servicecode.TimeClass で決めるので、「・夜」と「・深」の付くサービス内容と別の表記も同じ区分になる。
func HasScheduleEndAdjustment(service string) bool {
	class, ok := servicecode.TimeClass(service)
	return ok && (class == "I２" || class == "I３" || class == "I４")
}

// IsMatchingService は、予定と実績のサービス内容が対応するかを返す。
// 両側を servicecode.Base で「・夜」と「・深」を外してから比べる。別の表記はそろえない。「・夜」「・深」と実績の加算の対応は確認しない。
// 予定の `医` は、実績の `基本療養費` か `難病等複数回訪問` を含むサービス内容に対応する。
func IsMatchingService(schedule, visit string) bool {
	if servicecode.Base(schedule) == servicecode.Base(visit) {
		return true
	}
	return schedule == "医" &&
		(strings.Contains(visit, "基本療養費") || strings.Contains(visit, "難病等複数回訪問"))
}
