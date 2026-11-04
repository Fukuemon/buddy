// Package calendarimport は、職員が結び付けた外部のカレンダー（Google カレンダー）の、期間を決めた予定を、手動で buddy の予定に取り込む。
// 取り込むとどうなるかを返す Preview と、プレビューと同じ規則で読み替えて書く Import を持つ。
// 結び付けたカレンダー、予定の対応、取り込みの記録と、外部の予定と buddy の予定を読み替える規則は calendar にある。
package calendarimport

// 衝突の原因の code。httpapi が 409 のレスポンスの code にする。
const (
	// CodeImportRunning は、同じカレンダーの取り込みが進んでいることを表す。
	CodeImportRunning = "import_running"
	// CodeReviewChanged は、プレビューの後に確認が必要な予定が変わったことを表す。
	CodeReviewChanged = "import_preview_changed"
)
