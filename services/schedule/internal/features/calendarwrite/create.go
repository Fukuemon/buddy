package calendarwrite

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Create は、google_primary の事業所に、単発の予定を Google カレンダーに書いて作る（ADR-0026）。
type Create struct {
	locks       FacilityLock
	cutovers    Cutovers
	types       kernel.Finder[schedule.Type]
	staffRefs   kernel.Finder[staff.Ref]
	staffNames  kernel.Finder[staff.Detail]
	visits      VisitInfos
	details     VisitDetails
	calendars   Calendars
	records     RecordRepository
	projections Projections
	accounts    calendar.Accounts
	now         func() time.Time
	tx          tx.Transactor
}

// NewCreate は Create を作る。accounts が nil（サービスアカウントの設定が無い）なら、Do は calendar.ErrNotConfigured を返す。
// now は、書く期限と、退職した職員を割り振ったまま保存できる予定の日付を決める時刻である。nil なら time.Now を使う。
func NewCreate(locks FacilityLock, cutovers Cutovers, types kernel.Finder[schedule.Type], staffRefs kernel.Finder[staff.Ref], staffNames kernel.Finder[staff.Detail],
	visits VisitInfos, details VisitDetails, calendars Calendars, records RecordRepository, projections Projections, accounts calendar.Accounts,
	now func() time.Time, tx tx.Transactor) Create {
	if now == nil {
		now = time.Now
	}
	return Create{
		locks: locks, cutovers: cutovers, types: types, staffRefs: staffRefs, staffNames: staffNames, visits: visits, details: details,
		calendars: calendars, records: records, projections: projections, accounts: accounts, now: now, tx: tx,
	}
}

// write は、1 回の作成で Google に書くものである。
type write struct {
	scheduleID string
	cal        calendar.ExternalCalendar
	eventID    string
	// version は、Google に書く保留の版か、作成が済んだ記録の送り直しでは確定した版である。
	version int
	// written は、作成が済んで確定した記録への送り直しかである。Google に作らず、Google の予定と比べるだけにする。
	written bool
	// resend は、保留の版がある記録への送り直しかである。作る前に Google を読み、最初の書き込みが届いたかを確認する。
	resend bool
	// pendingVisit と deadline は、resend のときの、記録の保留の版の訪問の情報と書く期限である。
	pendingVisit *string
	deadline     time.Time
	// candidate は、resend のときに入力から作った訪問の情報である。最初の書き込みが届かないと分かったときだけ、新しい保留の版に使う。
	candidate *string
	body      calendar.EventBody
	detail    scheduleview.Detail
}

// Do は、事業所 facilityID に、画面が決めた ID が id の単発の予定を、予定の職員のカレンダーに書いて作り、書いた予定を返す。
// 書き込みは ADR-0026 の手順に従う。1 つ目のトランザクションで、事業所の行を共有のロックで読んでモードと切り替えを確認し、
// schedule の規則（schedule.PrepareSchedule）で入力と権限を確認して、記録に保留の版を書く。トランザクションの外で Google に作り、
// 2 つ目のトランザクションで、Google が返した予定を Projection に写して保留の版を確定する。
// 同じ id で送り直したときは、Google の予定を 1 つのままにし、Google の予定が送った内容と同じなら成功を返す。
//
// 入力と参照のエラー、apperr.ErrForbidden は schedule.Create と同じである。事業所が無いときは apperr.ErrNotFound を返す。
// 次のときは apperr.ErrConflict を返す: 事業所が google_primary でない、open の切り替えがある（CodeCutoverOpen）、予定の職員に
// 外していないカレンダーが無い（CodeCalendarNotLinked）、同じ id の書き込みが途中である（CodeWritePending）、
// Google の予定が送った内容と違う（CodeEventChanged）、Google で予定が見つからない（CodeEventNotFound）、
// カレンダーに書けない（CodeCalendarUnwritable）、Google が内容を受け付けない（CodeEventRejected）、id がほかの予定に使われている。
// Google が受けたかが分からないときは ErrWriteUnknown を、Google が一時的に拒んだときは ErrGoogleUnavailable を包んだエラーを返す。
//
// 送り直しは、記録の状態で分ける。作成が済んで確定した記録では、入力の訪問の情報を使わずに Google の予定と比べるだけにする。
// 書く期限の前の「書いている途中」の保留の版がある記録では、CodeWritePending で拒む。ほかの保留の版がある記録では、作る前に
// Google を読み、最初の書き込みが届いたかで分ける（resend）。保留の版の訪問の情報は、Google が受けた版なら失わない。
// 保留の版を書いた後は、リクエストが取り消されても、Google の結果を記録に残すまで続ける。
func (c Create) Do(ctx context.Context, facilityID, id string, in schedule.SlotInput) (scheduleview.Detail, error) {
	if id == "" {
		return scheduleview.Detail{}, apperr.Invalid("Google カレンダーを予定の正本にする事業所では、予定の ID（id）が必須です")
	}
	eventID, err := calendar.EventIDOf(id)
	if err != nil {
		return scheduleview.Detail{}, apperr.Invalid("予定の ID %s は ULID ではありません", id)
	}
	if c.accounts == nil {
		return scheduleview.Detail{}, calendar.ErrNotConfigured
	}
	writer, err := c.accounts.Writer(ctx, facilityID)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	source, err := c.accounts.Source(ctx, facilityID)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	var w write
	err = c.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		w, err = c.begin(ctx, facilityID, id, eventID, in)
		return err
	})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	ctx = context.WithoutCancel(ctx)
	switch {
	case w.written:
		return c.reconcile(ctx, source, w)
	case w.resend:
		return c.resend(ctx, source, writer, w)
	}
	return c.insert(ctx, source, writer, w)
}

// insert は、手順 2 から 5 を行う。Google に予定を作り、結果で保留の版を確定するか、消すか、残す。
func (c Create) insert(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, w write) (scheduleview.Detail, error) {
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	ev, err := writer.Insert(callCtx, w.cal.CalendarID, w.eventID, w.body)
	cancel()
	switch {
	case err == nil:
		return c.confirm(ctx, w, ev)
	case errors.Is(err, calendar.ErrEventExists):
		return c.reconcile(ctx, source, w)
	case errors.Is(err, calendar.ErrOutcomeUnknown):
		if serr := c.settle(ctx, w, false); serr != nil {
			return scheduleview.Detail{}, serr
		}
		return scheduleview.Detail{}, fmt.Errorf("%w: %w", ErrWriteUnknown, err)
	default:
		if serr := c.settle(ctx, w, true); serr != nil {
			return scheduleview.Detail{}, serr
		}
		return scheduleview.Detail{}, writeError(err)
	}
}

// begin は、手順 1 を 1 つ目のトランザクションの中で行い、Google に書くものを返す。
func (c Create) begin(ctx context.Context, facilityID, id, eventID string, in schedule.SlotInput) (write, error) {
	f, err := c.locks.GetForShare(ctx, facilityID)
	if err != nil {
		return write{}, err
	}
	if f.SourceMode != organization.SourceGooglePrimary {
		return write{}, errNotGooglePrimary
	}
	open, err := c.cutovers.FindOpenCutover(ctx, facilityID)
	if err != nil {
		return write{}, err
	}
	if open != nil {
		return write{}, errCutoverOpen
	}
	sc, typ, err := schedule.PrepareSchedule(ctx, c.types, c.staffRefs, c.visits, c.now, facilityID, id, in)
	if err != nil {
		return write{}, err
	}
	cal, err := c.calendars.ActiveByStaff(ctx, sc.StaffID)
	if errors.Is(err, apperr.ErrNotFound) {
		return write{}, errCalendarNotLinked
	}
	if err != nil {
		return write{}, err
	}
	detail, err := c.detailOf(ctx, sc, typ)
	if err != nil {
		return write{}, err
	}
	w := write{scheduleID: id, cal: cal, eventID: eventID, detail: detail}
	now := c.now()
	rec, err := c.records.GetForUpdate(ctx, id)
	switch {
	case errors.Is(err, apperr.ErrNotFound):
		w.version = 1
		rec = calendar.EventRecord{
			ScheduleID: id, FacilityID: facilityID, ExternalCalendarID: cal.ID, ExternalEventID: eventID,
			Pending: &calendar.PendingWrite{Version: w.version, State: calendar.PendingWriting, VisitInfoID: sc.VisitInfoID, Deadline: now.Add(WriteDeadline)},
		}
		if err := c.records.Create(ctx, rec); errors.Is(err, apperr.ErrConflict) {
			return write{}, errWritePending
		} else if err != nil {
			return write{}, err
		}
	case err != nil:
		return write{}, err
	case rec.FacilityID != facilityID || rec.ExternalCalendarID != cal.ID:
		return write{}, errIDTaken
	case rec.Pending == nil:
		if err := deleteVisit(ctx, c.visits, sc.VisitInfoID); err != nil {
			return write{}, err
		}
		w.version, w.written = rec.Version, true
		if err := c.useStoredVisit(ctx, &w.detail, rec.VisitInfoID); err != nil {
			return write{}, err
		}
	case rec.Pending.IsWriting(now):
		return write{}, errWritePending
	default:
		w.version, w.resend = rec.Pending.Version, true
		w.pendingVisit, w.deadline, w.candidate = rec.Pending.VisitInfoID, rec.Pending.Deadline, sc.VisitInfoID
	}
	w.body = calendar.ScheduleBody(detail)
	w.setVersion(w.version)
	return w, nil
}

// setVersion は、Google に書く版を v にし、予定の本文の版も v にする。
func (w *write) setVersion(v int) {
	w.version = v
	w.body.Private[calendar.PropVersion] = strconv.Itoa(v)
}

// detailOf は、組み立てた予定 sc を、応答と予定の本文に使う名前付きの予定にする。
func (c Create) detailOf(ctx context.Context, sc schedule.Schedule, typ schedule.Type) (scheduleview.Detail, error) {
	st, err := c.staffNames.Get(ctx, sc.StaffID)
	if err != nil {
		return scheduleview.Detail{}, err
	}
	d := scheduleview.Detail{Schedule: sc, TypeName: typ.Name, StaffName: st.Username, Source: scheduleview.SourceGoogleCalendar}
	if err := c.useStoredVisit(ctx, &d, sc.VisitInfoID); err != nil {
		return scheduleview.Detail{}, err
	}
	return d, nil
}

// useStoredVisit は、予定 d の訪問の情報を、保存した訪問の情報 id にする。id が nil なら訪問の情報を外す。
func (c Create) useStoredVisit(ctx context.Context, d *scheduleview.Detail, id *string) error {
	d.VisitInfoID, d.Visit = id, nil
	if id == nil {
		return nil
	}
	v, err := c.details.GetDetail(ctx, *id)
	if err != nil {
		return err
	}
	d.Visit = &v
	return nil
}

// confirm は、手順 3 を行う。2 つ目のトランザクションで、Google が返した予定 ev を Projection に写し、保留の版を確定する。
func (c Create) confirm(ctx context.Context, w write, ev calendar.Event) (scheduleview.Detail, error) {
	err := c.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := c.confirmRecord(ctx, w); err != nil {
			return err
		}
		return c.project(ctx, w.cal, ev)
	})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	return c.result(w, ev), nil
}

// reconcile は、作成が 409（calendar.ErrEventExists）だったときと、確定した記録への送り直しで、Google の予定を読んで比べる。
// 読んだ etag で上書きしない。Google の予定の buddy の予定の ID と版が送った版と同じなら保留の版を確定し、違えば保留の版を消す。
// どちらでも、読んだ予定を Projection に写す。予定の内容も同じなら成功を返し、違えば errEventChanged を返す。
// 読めなかったときは、保留の版を「結果が分からない」にして残し、ErrWriteUnknown を包んだエラーを返す。
func (c Create) reconcile(ctx context.Context, source calendar.EventSource, w write) (scheduleview.Detail, error) {
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	ev, err := source.Event(callCtx, w.cal.CalendarID, w.eventID)
	cancel()
	if err != nil {
		if w.written {
			if errors.Is(err, calendar.ErrEventNotFound) {
				return scheduleview.Detail{}, errEventNotFound
			}
			return scheduleview.Detail{}, fmt.Errorf("%w: %w", ErrGoogleUnavailable, err)
		}
		if serr := c.settle(ctx, w, false); serr != nil {
			return scheduleview.Detail{}, serr
		}
		return scheduleview.Detail{}, fmt.Errorf("%w: %w", ErrWriteUnknown, err)
	}
	ours := ev.Private[calendar.PropScheduleID] == w.scheduleID
	accepted := ours && ev.Private[calendar.PropVersion] == strconv.Itoa(w.version)
	err = c.tx.WithinTx(ctx, func(ctx context.Context) error {
		switch {
		case w.written:
		case accepted:
			if err := c.confirmRecord(ctx, w); err != nil {
				return err
			}
		default:
			if err := c.rejectRecord(ctx, w); err != nil {
				return err
			}
		}
		return c.project(ctx, w.cal, ev)
	})
	if err != nil {
		return scheduleview.Detail{}, err
	}
	switch {
	case !ours:
		return scheduleview.Detail{}, errIDTaken
	case ev.Status == calendar.StatusCancelled:
		return scheduleview.Detail{}, errEventNotFound
	case !accepted || !sameContent(ev, w.body):
		return scheduleview.Detail{}, errEventChanged
	}
	return c.result(w, ev), nil
}

// resend は、保留の版がある記録への送り直しで、Google に作る前に予定を読み、最初の書き込みが届いたかで分ける（ADR-0026 の読み戻しの規則）。
// 保留の版の訪問の情報は変えず、入力から作った訪問の情報（候補）は、最初の書き込みが届かないと分かったときだけ使う。
//   - Google の予定の buddy の予定の ID と版が保留の版と同じ: 保留の版の訪問の情報で確定し、Projection に写す。内容も同じなら成功を返し、違えば errEventChanged を返す。
//   - buddy の予定の ID が違う: 保留の版を変えずに errIDTaken を返す。
//   - 版が違うか、取り消されている: 書く期限を過ぎていれば保留の版を消す。Projection に写し、errEventChanged か errEventNotFound を返す。
//   - 予定が無い: 書く期限を過ぎていれば、候補で次の版の保留の版を書いて作り直す。期限の前なら、まだ届く途中のことがあるので errWritePending を返す。
//   - 読めない: 保留の版を変えずに ErrWriteUnknown を包んだエラーを返す。
//
// 読んでいる間に、ほかの送り直しが保留の版を解いていれば、保留の版を変えずに errWritePending を返す。
func (c Create) resend(ctx context.Context, source calendar.EventSource, writer calendar.EventWriter, w write) (scheduleview.Detail, error) {
	callCtx, cancel := context.WithTimeout(ctx, CallTimeout)
	ev, err := source.Event(callCtx, w.cal.CalendarID, w.eventID)
	cancel()
	expired := !c.now().Before(w.deadline)
	if errors.Is(err, calendar.ErrEventNotFound) {
		if !expired {
			return scheduleview.Detail{}, c.discardCandidate(ctx, w, errWritePending)
		}
		recreated := false
		err := c.tx.WithinTx(ctx, func(ctx context.Context) error {
			rec, ok, err := c.pendingRecord(ctx, w)
			if err != nil || !ok {
				return err
			}
			prev := rec.Pending.VisitInfoID
			rec.Pending = &calendar.PendingWrite{Version: w.version + 1, State: calendar.PendingWriting, VisitInfoID: w.candidate, Deadline: c.now().Add(WriteDeadline)}
			if err := c.records.Update(ctx, rec); err != nil {
				return err
			}
			recreated = true
			return deleteVisit(ctx, c.visits, prev)
		})
		if err != nil {
			return scheduleview.Detail{}, err
		}
		if !recreated {
			return scheduleview.Detail{}, c.discardCandidate(ctx, w, errWritePending)
		}
		w.setVersion(w.version + 1)
		w.resend, w.pendingVisit, w.candidate = false, nil, nil
		return c.insert(ctx, source, writer, w)
	}
	if err != nil {
		return scheduleview.Detail{}, c.discardCandidate(ctx, w, fmt.Errorf("%w: %w", ErrWriteUnknown, err))
	}
	ours := ev.Private[calendar.PropScheduleID] == w.scheduleID
	cancelled := ev.Status == calendar.StatusCancelled
	accepted := ours && !cancelled && ev.Private[calendar.PropVersion] == strconv.Itoa(w.version)
	if !ours {
		return scheduleview.Detail{}, c.discardCandidate(ctx, w, errIDTaken)
	}
	resolved := false
	err = c.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := deleteVisit(ctx, c.visits, w.candidate); err != nil {
			return err
		}
		_, ok, err := c.pendingRecord(ctx, w)
		if err != nil {
			return err
		}
		switch {
		case !ok:
			return nil
		case accepted:
			err = c.confirmRecord(ctx, w)
		case expired:
			err = c.rejectRecord(ctx, w)
		}
		if err != nil {
			return err
		}
		resolved = true
		return c.project(ctx, w.cal, ev)
	})
	switch {
	case err != nil:
		return scheduleview.Detail{}, err
	case !resolved:
		return scheduleview.Detail{}, errWritePending
	case cancelled:
		return scheduleview.Detail{}, errEventNotFound
	case !accepted || !sameContent(ev, w.body):
		return scheduleview.Detail{}, errEventChanged
	}
	if err := c.useStoredVisit(ctx, &w.detail, w.pendingVisit); err != nil {
		return scheduleview.Detail{}, err
	}
	return c.result(w, ev), nil
}

// discardCandidate は、送り直しの入力から作った訪問の情報を消し、cause を返す。消せなければ、そのエラーを返す。
func (c Create) discardCandidate(ctx context.Context, w write, cause error) error {
	err := c.tx.WithinTx(ctx, func(ctx context.Context) error {
		return deleteVisit(ctx, c.visits, w.candidate)
	})
	if err != nil {
		return err
	}
	return cause
}

// settle は、Google に書けなかった保留の版を、トランザクションの中で解く。rejected なら、Google が拒んだことが確かなので
// 保留の版を消し（手順 4）、そうでなければ「結果が分からない」にして残す（手順 5）。
func (c Create) settle(ctx context.Context, w write, rejected bool) error {
	return c.tx.WithinTx(ctx, func(ctx context.Context) error {
		if rejected {
			return c.rejectRecord(ctx, w)
		}
		rec, ok, err := c.pendingRecord(ctx, w)
		if err != nil || !ok {
			return err
		}
		rec.Pending.State = calendar.PendingUnknown
		return c.records.Update(ctx, rec)
	})
}

// pendingRecord は、記録を排他のロックで読み、w の版の保留の版を持つときだけ ok を true にして返す（calendar.LockPending）。
func (c Create) pendingRecord(ctx context.Context, w write) (calendar.EventRecord, bool, error) {
	return calendar.LockPending(ctx, c.records, w.scheduleID, w.version)
}

// confirmRecord は、w の版の保留の版がまだあれば、calendar.ConfirmPending で確定する。
func (c Create) confirmRecord(ctx context.Context, w write) error {
	rec, ok, err := c.pendingRecord(ctx, w)
	if err != nil || !ok {
		return err
	}
	return calendar.ConfirmPending(ctx, c.records, c.visits, rec)
}

// rejectRecord は、w の版の保留の版がまだあれば、calendar.RejectPending で消す。
func (c Create) rejectRecord(ctx context.Context, w write) error {
	rec, ok, err := c.pendingRecord(ctx, w)
	if err != nil || !ok {
		return err
	}
	return calendar.RejectPending(ctx, c.records, c.visits, rec)
}

// project は、カレンダー cal の Google の予定 ev を Projection の行に写す。
func (c Create) project(ctx context.Context, cal calendar.ExternalCalendar, ev calendar.Event) error {
	if ev.Status == calendar.StatusCancelled {
		return c.projections.Put(ctx, calendar.CancelledProjectionOf(cal, ev, civil.Today(c.now())))
	}
	p, err := calendar.ProjectionOf(cal, ev)
	if err != nil {
		// shortcut: 日時を読めない予定は写さず、同期（calendarsync）が写すか消すのに任せる。Google が日時の無い予定を返したら直す
		return nil
	}
	return c.projections.Put(ctx, p)
}

// result は、Google に書いた予定 ev から応答の予定を作る。作成と更新の時刻は、Google で最後に変えた時刻にする。
func (c Create) result(w write, ev calendar.Event) scheduleview.Detail {
	d := w.detail
	d.Version = w.version
	at := c.now()
	if t, err := time.Parse(time.RFC3339, ev.Updated); err == nil {
		at = t
	}
	d.CreatedAt, d.UpdatedAt = at, at
	return d
}

// writeError は、Google が作成を拒んだときの EventWriter のエラーを、ADR-0026 の表の応答のエラーにする。
func writeError(err error) error {
	switch {
	case errors.Is(err, calendar.ErrEventChanged):
		return errEventChanged
	case errors.Is(err, calendar.ErrEventGone), errors.Is(err, calendar.ErrEventNotFound):
		return errEventNotFound
	case errors.Is(err, calendar.ErrUnwritable):
		return errUnwritable
	case errors.Is(err, calendar.ErrEventRejected):
		return errEventRejected
	case errors.Is(err, calendar.ErrUnavailable):
		return fmt.Errorf("%w: %w", ErrGoogleUnavailable, err)
	}
	return err
}

// sameContent は、Google の予定 ev の内容（タイトル、日時、繰り返しの規則、説明）が、書こうとした内容 b と同じかを返す。
func sameContent(ev calendar.Event, b calendar.EventBody) bool {
	description := ""
	if b.Description != nil {
		description = *b.Description
	}
	if ev.Summary != b.Summary || ev.Description != description || !slices.Equal(ev.Recurrence, b.Recurrence) {
		return false
	}
	return sameInstant(ev.Start, b.Start) && sameInstant(ev.End, b.End)
}

// sameInstant は、2 つの日時が同じ時刻を指すかを返す。どちらかを読めなければ false を返す。
func sameInstant(a, b calendar.When) bool {
	ta, err := a.Instant()
	if err != nil {
		return false
	}
	tb, err := b.Instant()
	return err == nil && ta.Equal(tb)
}

// deleteVisit は、訪問の情報 id がどの予定と記録にも指されていなければ消す。id が nil なら何もしない。
func deleteVisit(ctx context.Context, visits VisitInfos, id *string) error {
	if id == nil {
		return nil
	}
	return visits.DeleteIfUnused(ctx, *id)
}
