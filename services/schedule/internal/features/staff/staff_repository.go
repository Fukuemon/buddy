package staff

import (
	"context"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
)

// Repository は、職員を読み書きする。見つからないときは apperr.ErrNotFound を、
// 同じ事業所にメールが重なる職員がいるか、Sub が重なるときは apperr.ErrConflict を返す。名前は重なってよい。
//
// FindIDBySub は、Sub が sub の職員の ID を返す。
//
// StartLeave は、職員を休職にした時刻と戻る予定の日を書く。休職の職員を休職にし直しても、最初に休職にした時刻を残し、
// 戻る予定の日だけを書き換える。EndLeave は、休職を外す。Retire は、職員を退職にし、メールと電話番号を消す。
// 退職し直しても、最初に退職にした時刻を残す。StartLeave と EndLeave は、退職した職員では apperr.ErrConflict を返す。
//
// ActiveManagers は、事業所で職員の管理の権限を持つ有効な職員の ID を返す。
//
// ChangePosition は、職員の役職を positionID にし、職員の権限と対象を全て消してから grants を書く。
//
// UpdateProfile は、職員の名前、電話番号、部署、チームを p にし、職員の権限のうちチーム oldTeamID を指す対象を p.TeamID に移す。
// 同じ権限が p.TeamID を既に対象にしていれば、oldTeamID の対象を消す。職員が無いときは apperr.ErrNotFound を、
// 退職した職員なら apperr.ErrConflict を返す。
//
// AddGrant は、職員に 1 つの権限と対象を書く。同じ権限が既にあるときは apperr.ErrConflict を返す。
// RemoveGrant は、職員の権限 userPolicyID と対象を消す。職員のその権限が無いときは apperr.ErrNotFound を返す。
type Repository interface {
	Create(ctx context.Context, s Staff, grants []Grant) error
	ChangePosition(ctx context.Context, id, positionID string, grants []Grant) error
	UpdateProfile(ctx context.Context, id string, p Profile, oldTeamID string) error
	AddGrant(ctx context.Context, id string, g Grant) error
	RemoveGrant(ctx context.Context, id, userPolicyID string) error
	Get(ctx context.Context, id string) (Detail, error)
	ListByFacility(ctx context.Context, facilityID string, q ListQuery) ([]Summary, error)
	FindIDBySub(ctx context.Context, sub string) (string, error)
	StartLeave(ctx context.Context, id string, returnDate *civil.Date) error
	EndLeave(ctx context.Context, id string) error
	Retire(ctx context.Context, id string) error
	ActiveManagers(ctx context.Context, facilityID string) ([]string, error)
}
