package staff

import "context"

// Get は、職員と権限を返す。
func (s *App) Get(ctx context.Context, id string) (Detail, error) {
	return s.deps.Staff.Get(ctx, id)
}
