package calendar

import (
	"context"
)

// Mine は、職員に結び付いた外していないカレンダーを、最後の取り込みを付けて返す。
// 職員が自分のカレンダーを読む操作なので、権限を求めない。呼ぶ側は、トークンの職員の ID だけを渡す。
type Mine struct {
	calendars Repository
}

// NewMine は Mine を作る。
func NewMine(calendars Repository) Mine {
	return Mine{calendars: calendars}
}

// Do は、事業所 facilityID の職員 staffID に結び付いたカレンダーを返す。結び付いていなければ nil を返す。
func (u Mine) Do(ctx context.Context, facilityID, staffID string) (*ExternalCalendar, error) {
	cs, err := u.calendars.ListByFacility(ctx, facilityID)
	if err != nil {
		return nil, err
	}
	for _, c := range cs {
		if c.StaffID == staffID {
			return &c, nil
		}
	}
	return nil, nil
}
