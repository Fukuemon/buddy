package internalapi

import (
	"context"

	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

// Store は、ブローカーの職員を読み書きする。
type Store interface {
	// Get は、ID が id の職員を返す。いなければ staff.ErrNotFound を返す。
	Get(ctx context.Context, id string) (staff.Member, error)
	// Register は、m のメールの職員がいなければ m を書き、書いた職員と true を返す。メールは全ての事業所で一意である。
	// 同じ事業所に同じメールの職員がいれば、書かずにその職員と false を返す。その職員が止められていれば staff.ErrSuspended を、
	// ほかの事業所にいれば staff.ErrEmailTaken を返す。
	Register(ctx context.Context, m staff.Member) (staff.Member, bool, error)
	// Activate は、登録の途中の職員 id を有効にする。有効な職員を有効にしても成功する。いなければ staff.ErrNotFound を、
	// 止めた職員なら staff.ErrSuspended を、退職した職員なら staff.ErrRetired を返す。
	Activate(ctx context.Context, id string) error
	// Delete は、登録の途中の職員 id を消す。いなければ staff.ErrNotFound を、登録の途中でなければ staff.ErrNotPending を返す。
	Delete(ctx context.Context, id string) error
	// Suspend は、職員 id を止める。止めた職員を止めても成功する。いなければ staff.ErrNotFound を、
	// 退職した職員なら staff.ErrRetired を返す。
	Suspend(ctx context.Context, id string) error
	// Resume は、止めた職員 id を有効に戻す。上流のアカウントの結び付けは残す。有効な職員を戻しても成功する。
	// いなければ staff.ErrNotFound を、退職した職員なら staff.ErrRetired を、登録の途中の職員なら staff.ErrNotSuspended を返す。
	Resume(ctx context.Context, id string) error
	// Retire は、職員 id を退職にし、メールと上流のアカウントを消す。退職した職員を退職にしても成功する。
	// いなければ staff.ErrNotFound を返す。
	Retire(ctx context.Context, id string) error
}
