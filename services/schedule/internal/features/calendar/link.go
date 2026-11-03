package calendar

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// Link は、事業所の職員 staffID に、calendarID のカレンダーを結び付ける。事業所のサービスアカウントで読めるかを確認してから書く。
// 外した同じカレンダーが同じ職員にあれば、結び付け直す。
// 職員が見つからないか、別の事業所の職員か、退職した職員のときは入力のエラーを、職員にほかのカレンダーがあるか、
// カレンダーがほかの職員に結び付いているか、すでに結び付いているときは apperr.ErrConflict を返す。
func (u *App) Link(ctx context.Context, facilityID, staffID, calendarID string) (ExternalCalendar, error) {
	if err := u.guard(ctx); err != nil {
		return ExternalCalendar{}, err
	}
	src, calendarID, err := u.requireSource(ctx, facilityID, calendarID)
	if err != nil {
		return ExternalCalendar{}, err
	}
	st, err := u.deps.Staff.Get(ctx, staffID)
	if err != nil {
		return ExternalCalendar{}, apperr.Reference("職員", staffID, err)
	}
	if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
		return ExternalCalendar{}, err
	}
	if err := requireLinkable(st); err != nil {
		return ExternalCalendar{}, err
	}
	if err := src.Check(ctx, calendarID); err != nil {
		return ExternalCalendar{}, err
	}
	var linked ExternalCalendar
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		// 退職はカレンダーを外すので、確認した後に退職した職員へ結び付けないよう、ロックしてから読み直す
		if err := u.deps.Staff.LockStatuses(ctx, facilityID); err != nil {
			return err
		}
		if st, err := u.deps.Staff.Get(ctx, st.ID); err != nil {
			return err
		} else if err := requireLinkable(st); err != nil {
			return err
		}
		cur, err := u.deps.Calendars.FindByCalendarID(ctx, ProviderGoogle, calendarID)
		switch {
		case errors.Is(err, apperr.ErrNotFound):
			c := ExternalCalendar{ID: u.ids.NewID(), FacilityID: facilityID, StaffID: st.ID, Provider: ProviderGoogle, CalendarID: calendarID}
			if err := u.deps.Calendars.Create(ctx, c); err != nil {
				return staffTaken(err)
			}
			cur.ID = c.ID
		case err != nil:
			return err
		case cur.StaffID != st.ID:
			return apperr.ConflictCode(CodeCalendarTaken, "このカレンダーは、ほかの職員に結び付いています")
		case cur.DisabledAt == nil:
			return apperr.ConflictCode(CodeCalendarLinked, "このカレンダーは、この職員にすでに結び付いています")
		default:
			if err := u.deps.Calendars.Enable(ctx, cur.ID); err != nil {
				return staffTaken(err)
			}
		}
		linked, err = u.deps.Calendars.Get(ctx, cur.ID)
		return err
	})
	return linked, err
}

// requireLinkable は、職員 st にカレンダーを結び付けられるかを確認する。退職した職員には結び付けられない（ADR-0018）。
func requireLinkable(st staff.Ref) error {
	if st.Status == staff.StatusRetired {
		return apperr.Invalid("退職した職員には、カレンダーを結び付けられません")
	}
	return nil
}

// staffTaken は、カレンダーを書くエラーが衝突なら、職員にほかのカレンダーがあることを表すエラーにする。
func staffTaken(err error) error {
	if errors.Is(err, apperr.ErrConflict) {
		return apperr.ConflictCode(CodeStaffHasCalendar, "この職員には、ほかのカレンダーが結び付いています")
	}
	return err
}
