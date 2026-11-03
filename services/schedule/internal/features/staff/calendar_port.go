package staff

import "context"

// CalendarDetacher は、退職した職員の外部のカレンダーを外す。実装は postgres.CalendarRepository である。
type CalendarDetacher interface {
	// DetachByStaff は、職員 staffID の外していないカレンダーを外す。カレンダーのレコードと予定の対応は残す。
	// カレンダーが無ければ何もしない。
	DetachByStaff(ctx context.Context, staffID string) error
}
