package staff

import "context"

// Get は、職員と権限を返す。
type Get struct {
	staff Repository
}

// NewGet は Get を作る。
func NewGet(staff Repository) Get {
	return Get{staff: staff}
}

// Do は、職員と権限を返す。
func (s Get) Do(ctx context.Context, id string) (Detail, error) {
	return s.staff.Get(ctx, id)
}
