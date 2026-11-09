package login

import (
	"context"

	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

// Staff は、職員を読み、上流のアカウントを結び付ける。
type Staff interface {
	// FindByEmail は、email（staff.NormalizeEmail でそろえた値）の職員を全ての事業所から返す。いなければ空を返す。
	FindByEmail(ctx context.Context, email string) ([]staff.Member, error)
	// Get は、ID が id の職員を返す。いなければ staff.ErrNotFound を返す。
	Get(ctx context.Context, id string) (staff.Member, error)
	// Link は、有効な職員 staffID に上流のアカウントを結び付ける。結び付けられないときと、職員が有効でないときは
	// staff.ErrConflict を返す。
	Link(ctx context.Context, staffID string, a staff.UpstreamAccount) error
}
