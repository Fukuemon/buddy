package calendar

import (
	"context"
	"errors"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Link は、事業所の職員 staffID に、calendarID のカレンダーを結び付ける。
type Link struct {
	accounts  Accounts
	staff     StaffRefs
	locks     FacilityLock
	calendars Repository
	tx        tx.Transactor
	ids       kernel.IDGenerator
	guard     kernel.Guard
}

// NewLink は Link を作る。
func NewLink(accounts Accounts, staff StaffRefs, locks FacilityLock, calendars Repository, tx tx.Transactor, ids kernel.IDGenerator, guard kernel.Guard) Link {
	return Link{accounts: accounts, staff: staff, locks: locks, calendars: calendars, tx: tx, ids: ids, guard: guard}
}

// Do は、事業所の職員 staffID に、calendarID のカレンダーを結び付ける。事業所のサービスアカウントで読めるかを確認してから書く。
// 外した同じカレンダーが同じ職員にあれば、結び付け直す。
// 職員が見つからないか、別の事業所の職員か、退職した職員のときは入力のエラーを、職員にほかのカレンダーがあるか、
// カレンダーがほかの職員に結び付いているか、すでに結び付いているときは apperr.ErrConflict を返す。
func (u Link) Do(ctx context.Context, facilityID, staffID, calendarID string) (ExternalCalendar, error) {
	if err := u.guard(ctx); err != nil {
		return ExternalCalendar{}, err
	}
	src, calendarID, err := requireSource(ctx, u.accounts, facilityID, calendarID)
	if err != nil {
		return ExternalCalendar{}, err
	}
	st, err := u.staff.Get(ctx, staffID)
	if err != nil {
		return ExternalCalendar{}, apperr.Reference("職員", staffID, err)
	}
	if err := organization.RequireSameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
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
		if err := u.locks.Share(ctx, facilityID); err != nil {
			return err
		}
		if st, err := u.staff.Get(ctx, st.ID); err != nil {
			return err
		} else if err := requireLinkable(st); err != nil {
			return err
		}
		cur, err := u.calendars.FindByCalendarID(ctx, ProviderGoogle, calendarID)
		switch {
		case errors.Is(err, apperr.ErrNotFound):
			c := ExternalCalendar{ID: u.ids.NewID(), FacilityID: facilityID, StaffID: st.ID, Provider: ProviderGoogle, CalendarID: calendarID}
			if err := u.calendars.Create(ctx, c); err != nil {
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
			if err := u.calendars.Enable(ctx, cur.ID); err != nil {
				return staffTaken(err)
			}
		}
		linked, err = u.calendars.Get(ctx, cur.ID)
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
