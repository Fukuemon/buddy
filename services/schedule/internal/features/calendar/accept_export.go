package calendar

import (
	"context"
	"errors"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// acceptCallTimeout は、Google の内容に合わせる操作が、予定の行をロックしたまま外部のカレンダーを読む時間の上限である。
const acceptCallTimeout = 20 * time.Second

// AcceptExport は、確認が必要な書き出し id の予定を、buddy での変更によらず外部のカレンダーの今の内容にし、待ちを終えて返す。
type AcceptExport struct {
	exports   ExportRepository
	schedules ScheduleStore
	calendars Repository
	accounts  Accounts
	staff     StaffRefs
	tx        tx.Transactor
	ids       kernel.IDGenerator
	guard     organization.Guard
	apply     applier
}

// NewAcceptExport は AcceptExport を作る。types、patients、serviceCodes、visits は、外部のカレンダーの今の内容を予定に当てる規則（applier）が使う。
func NewAcceptExport(
	exports ExportRepository, schedules ScheduleStore, calendars Repository, accounts Accounts, staff StaffRefs,
	types Types, patients Patients, serviceCodes ServiceCodes, visits VisitStore,
	tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard,
) AcceptExport {
	return AcceptExport{
		exports: exports, schedules: schedules, calendars: calendars, accounts: accounts, staff: staff, tx: tx, ids: ids, guard: guard,
		apply: applier{
			calendars: calendars, exports: exports, schedules: schedules, types: types,
			patients: patients, serviceCodes: serviceCodes, visits: visits, ids: ids, now: time.Now,
		},
	}
}

// Do は、確認が必要な書き出し id の予定を、buddy での変更によらず外部のカレンダーの今の内容にし、待ちを終えて返す。
// 外部のカレンダーで消された予定は、キャンセルする。予定の職員が、外部の予定のカレンダーの職員と違えば、書き出しの待ちを積み直し、
// 今の職員のカレンダーへ移させる。
// 待ちが見つからないときは apperr.ErrNotFound を、確認が必要な待ちでないとき、外部の内容を当てられない待ちのとき、
// 予定の対応のカレンダーを外したとき（退職を含む）、
// 外部の予定を buddy の予定に読み替えられないときは apperr.ErrConflict を返す。外部のカレンダーを読めないときは Preview と同じである。
func (u AcceptExport) Do(ctx context.Context, id string) (Export, error) {
	if err := u.guard(ctx); err != nil {
		return Export{}, err
	}
	e, err := u.exports.Get(ctx, id)
	if err != nil {
		return Export{}, err
	}
	if !e.IsInReview() {
		return Export{}, errNotInReview
	}
	if !e.IsAcceptable() {
		return Export{}, errNotAcceptable
	}
	// buddy でキャンセルした予定は、外部の内容に戻せない。
	if d, err := u.schedules.Get(ctx, e.ScheduleID); err != nil {
		return Export{}, err
	} else if d.Cancel != nil {
		return Export{}, errNotAcceptable
	}
	l, err := u.calendars.LinkBySchedule(ctx, e.ScheduleID)
	if errors.Is(err, apperr.ErrNotFound) {
		return Export{}, errNotAcceptable
	}
	if err != nil {
		return Export{}, err
	}
	c, err := u.calendars.Get(ctx, l.ExternalCalendarID)
	if err != nil {
		return Export{}, err
	}
	if c.DisabledAt != nil {
		return Export{}, errNotAcceptable
	}
	src, err := source(ctx, u.accounts, c.FacilityID)
	if err != nil {
		return Export{}, err
	}
	err = u.tx.WithinTx(ctx, func(ctx context.Context) error {
		// 予定の行をロックしてから Google の予定を読む。同期の処理も同じ行をロックして Google の変更を当てるので、
		// 読んだ後に Google で変わった予定は、同期が後で比べて当てるか確認が必要な待ちにする。
		locked, err := u.schedules.GetForUpdate(ctx, e.ScheduleID)
		if err != nil {
			return err
		}
		// 退職はカレンダーを外すので、職員の休職、復職、退職を待たせてからカレンダーを読み直す。外したカレンダーの内容を当てると、
		// 退職した職員の予定を今日以降へ動かせるためである。予定の変更と同じく、予定の行のロックの後に取る。
		if err := u.staff.LockStatuses(ctx, c.FacilityID); err != nil {
			return err
		}
		if now, err := u.calendars.Get(ctx, c.ID); err != nil {
			return err
		} else if now.DisabledAt != nil {
			return errNotAcceptable
		}
		// 予定をほかの職員に割り振り直した後に、その職員が退職していることもある。退職した職員の予定は Google の内容に合わせない
		if st, err := u.staff.Get(ctx, locked.StaffID); err != nil {
			return err
		} else if st.Status == staff.StatusRetired {
			return errNotAcceptable
		}
		cur, err := u.exports.Get(ctx, id)
		if err != nil {
			return err
		}
		switch {
		case !cur.IsInReview():
			return errNotInReview
		case !cur.IsAcceptable() || locked.Cancel != nil:
			return errNotAcceptable
		}
		callCtx, cancel := context.WithTimeout(ctx, acceptCallTimeout)
		defer cancel()
		ev, err := externalEvent(callCtx, src, c, l)
		if err != nil {
			return err
		}
		// ロックを取らない RetryExport が、確認した後に書き直す待ちにしたときに当たる。
		if err := u.exports.Resolve(ctx, id, cur.Revision); errors.Is(err, apperr.ErrConflict) {
			return errNotInReview
		} else if err != nil {
			return err
		}
		err = u.apply.acceptSchedule(ctx, c, l, ev)
		if errors.Is(err, errUnappliable) {
			return apperr.ConflictCode(CodeExternalChangeUnappliable,
				"Google カレンダーの予定を、buddy の予定に読み替えられません。buddy の内容で書き直してください")
		}
		if err != nil {
			return err
		}
		// 職員を替えた予定は、今の職員のカレンダーへ移すために書き出し直す。キャンセルした予定は移さない。
		d, err := u.schedules.Get(ctx, e.ScheduleID)
		if err != nil || d.StaffID == c.StaffID || d.Cancel != nil {
			return err
		}
		return u.exports.Enqueue(ctx, u.ids.NewID(), e.Target)
	})
	if err != nil {
		return Export{}, err
	}
	return u.exports.Get(ctx, id)
}

// externalEvent は、予定の対応 l の外部の予定を読む。予定が見つからず、カレンダーは読めるときは、予定が消されたとみなし、
// 取り消した予定を返す。Google は、消した予定に 404 を返すことがあるためである。
func externalEvent(ctx context.Context, src EventSource, c ExternalCalendar, l EventLink) (Event, error) {
	ev, err := src.Event(ctx, c.CalendarID, l.ExternalEventID)
	if !errors.Is(err, ErrEventNotFound) {
		return ev, err
	}
	if cerr := src.Check(ctx, c.CalendarID); cerr != nil {
		return Event{}, err
	}
	return Event{ID: l.ExternalEventID, Status: StatusCancelled, ETag: l.ETag}, nil
}
