package staff

import "context"

// Registration は、ブローカーに職員を登録した結果である。Pending は、ブローカーの職員が登録の途中で、まだログインできないことを示す。
type Registration struct {
	ID      string
	Created bool
	Pending bool
}

// Identities は、ブローカーの職員の身元を書く（ADR-0015）。約束は broker.Client と同じである。
type Identities interface {
	// Register は、組織 orgID にメール email（NormalizeEmail でそろえた値）の職員を登録の途中の状態で登録する。
	// 同じ組織に同じメールの職員がいれば、作らずにその職員を返す。その職員が止められていれば ErrIdentitySuspended を、
	// ほかの組織に同じメールの職員がいれば ErrEmailTaken を返す。
	Register(ctx context.Context, orgID, email string) (Registration, error)
	// Activate は、登録の途中の職員を有効にし、ログインできるようにする。有効な職員を有効にしても成功する。
	// 止めた職員なら ErrIdentitySuspended を返す。
	Activate(ctx context.Context, id string) error
	// Unregister は、登録の途中の職員を消す。予定の API の書き込みに失敗したときに、登録を戻すのに使う。
	// いないか、登録の途中でなければ、消さずに成功する。
	Unregister(ctx context.Context, id string) error
	// Suspend は、職員を止め（休職）、ログインのセッション、同意、refresh token を取り消す。止めた職員を止めても成功する。
	// いなければ apperr.ErrNotFound を、退職した職員なら ErrIdentityRetired を、止めたが取り消せなければ ErrRevokeFailed を返す。
	Suspend(ctx context.Context, id string) error
	// Resume は、止めた職員を有効に戻す（復職）。上流のアカウントの結び付けは残す。有効な職員を戻しても成功する。
	// いなければ apperr.ErrNotFound を、退職した職員なら ErrIdentityRetired を、止めていない職員なら apperr.ErrConflict を返す。
	Resume(ctx context.Context, id string) error
	// Retire は、職員を退職にしてメールと上流のアカウントを消し、ログインのセッション、同意、refresh token を取り消す。
	// 退職した職員を退職にしても成功する。いなければ apperr.ErrNotFound を、退職にしたが取り消せなければ ErrRevokeFailed を返す。
	Retire(ctx context.Context, id string) error
}
