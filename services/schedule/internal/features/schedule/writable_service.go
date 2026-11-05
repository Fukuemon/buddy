package schedule

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// CodeGooglePrimary は、事業所が Google カレンダーを予定の正本にしているので予定を書けないことを表す 409 の code である。
const CodeGooglePrimary = "google_primary"

var errGooglePrimary = apperr.ConflictCode(CodeGooglePrimary,
	"この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください")

// RequireWritable は、事業所 f の予定を buddy から書けるかを確認する。buddy を予定の正本にする事業所（buddy_primary）だけが書ける。
// ほかのモードでは、code が CodeGooglePrimary の apperr.ErrConflict を返す（ADR-0027、ADR-0029）。
// 予定を書く操作と手動の取り込みが、事業所の行を共有のロックで読んだ後に呼ぶ。
func RequireWritable(f organization.Facility) error {
	if f.IsBuddyPrimary() {
		return nil
	}
	return errGooglePrimary
}
