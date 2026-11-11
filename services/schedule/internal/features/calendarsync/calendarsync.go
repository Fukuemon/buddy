// Package calendarsync は、職員が結び付けた外部のカレンダー（Google カレンダー）の変わった予定を読み、事業所の予定の管理先の規則で当てる。
// 変わった予定を読む Syncer と、1 つの外部の予定を当てる規則（Applier）を持つ。
// 結び付けたカレンダー、予定の対応、書き出しの待ちの記録と、外部の予定と buddy の予定を読み替える規則は calendar にある。
package calendarsync
