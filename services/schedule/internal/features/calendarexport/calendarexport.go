// Package calendarexport は、buddy の予定の変更を、職員が結び付けた外部のカレンダー（Google カレンダー）に書き出す。
// 予定の変更を書き出しの待ちに積む Outbox、待ちを外部のカレンダーに書く Exporter、確認が必要な待ちの一覧と書き直しの操作を持つ。
// 書き出しの待ちの記録と、外部の予定と buddy の予定を読み替える規則は calendar にある。
package calendarexport
