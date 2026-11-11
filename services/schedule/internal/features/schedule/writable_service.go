package schedule

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// CodeGooglePrimary は、事業所が予定を Google カレンダーで管理しているので予定を書けないことを表す 409 の code である。
const CodeGooglePrimary = "google_primary"

var errGooglePrimary = apperr.ConflictCode(CodeGooglePrimary,
	"この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください")

// RequireWritable は、事業所 f の予定を buddy から書けるかを確認する。予定を buddy で管理している事業所（buddy_primary）だけが書ける。
// ほかのモードでは、code が CodeGooglePrimary の apperr.ErrConflict を返す（ADR-0026）。
// 予定を書く操作と手動の取り込みが、事業所の行を共有のロックで読んだ後に呼ぶ。
func RequireWritable(f organization.Facility) error {
	if f.IsBuddyPrimary() {
		return nil
	}
	return errGooglePrimary
}
