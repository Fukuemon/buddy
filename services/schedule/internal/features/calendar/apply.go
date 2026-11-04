package calendar

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/Fukuemon/buddy/packages/go/gcaltitle"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// cancelledInGoogle は、外部のカレンダーで消された予定を buddy でキャンセルするときの理由である。
const cancelledInGoogle = "Google カレンダーで消されました"

// errUnappliable は、外部の予定の変更を buddy の予定に読み替えられないことを表す。
var errUnappliable = errors.New("外部の予定の変更を buddy の予定に読み替えられない")

// errExportWriting は、予定を外部のカレンダーに書いている処理があるので、外部の予定の変更を後で読み直すことを表す。
// 書いた予定が増分に戻ってきたときに、予定の対応の etag を書く前に比べて、buddy と外部の両方が変わったと見誤らないためである。
var errExportWriting = errors.New("予定を外部のカレンダーに書いている")

// createdVersion は、作ったばかりの予定の更新の番号である。外部の予定から作った予定は外部の予定と同じなので、
// 予定の対応の同じにした時点の番号にこの値を書く。
const createdVersion = 1

// applier は、外部のカレンダーの予定の変更を、予定の対応の etag と更新の番号で比べ、buddy の予定に当てる。ADR-0009 の段階 3 の規則である。
//   - 外部の予定の etag が予定の対応と同じなら、何もしない。buddy が書いた変更が増分に戻ってきたときもこれに当たる。
//   - 外部の予定の内容が buddy の予定と同じなら、予定の対応を今の etag と更新の番号にする。buddy に比べない項目（説明）の
//     書き出していない変更があれば、etag だけを進めて書き出させる。
//   - buddy の予定の更新の番号が予定の対応と同じなら、外部だけが変わったので、外部の内容を buddy に当てる。
//   - 両方が変わったか、外部の変更を buddy の予定に読み替えられないときは、書き出しの待ちを確認が必要な待ちにする。
//
// 確認が必要な待ちは、buddy の内容で書き直す（App.RetryExport）か、外部の内容を当てる（App.AcceptExport）と解ける。
type applier struct {
	calendars    Repository
	exports      ExportRepository
	schedules    ScheduleStore
	recurring    RecurringStore
	types        Types
	patients     Patients
	serviceCodes ServiceCodes
	visits       VisitStore
	ids          kernel.IDGenerator
	now          func() time.Time
}

// applyEvent は、カレンダー c の外部の予定 ev の変更を buddy の予定に当てる。トランザクションの中で呼ぶ。
// buddy の予定と対応の無い予定は当てない。新しく作られた予定は、取り込み（App.Import）で buddy に移す。
// 予定を書いている書き出しの処理があれば errExportWriting を返す。
func (a applier) applyEvent(ctx context.Context, c ExternalCalendar, ev Event) error {
	l, err := a.calendars.LinkByEvent(ctx, c.ID, ev.ID)
	switch {
	case err == nil:
		if l.ETag == ev.ETag {
			return nil
		}
		if l.ScheduleID != nil {
			return a.syncSchedule(ctx, c, l, ev)
		}
		return a.syncRecurring(ctx, l, ev)
	case !errors.Is(err, apperr.ErrNotFound):
		return err
	}
	if ev.RecurringEventID == "" {
		return nil
	}
	parent, err := a.calendars.LinkByEvent(ctx, c.ID, ev.RecurringEventID)
	if errors.Is(err, apperr.ErrNotFound) || (err == nil && parent.RecurringScheduleID == nil) {
		return nil
	}
	if err != nil {
		return err
	}
	return a.syncOccurrence(ctx, c, parent, ev)
}

// syncSchedule は、カレンダー c の単発の予定に対応する外部の予定 ev の変更を当てる。
func (a applier) syncSchedule(ctx context.Context, c ExternalCalendar, l Link, ev Event) error {
	d, err := a.schedules.GetForUpdate(ctx, *l.ScheduleID)
	if err != nil {
		return err
	}
	t := Target{FacilityID: d.FacilityID, ScheduleID: d.ID}
	open, err := a.open(ctx, t)
	if err != nil {
		return err
	}
	if isSameSchedule(d, c.StaffID, ev) {
		return a.sameContent(ctx, l, d.Version, ev, open)
	}
	if !isSynced(l, d.Version) {
		code := ErrorPreconditionFailed
		if ev.Status == StatusCancelled {
			code = ErrorNotFound
		}
		return a.exports.Hold(ctx, a.ids.NewID(), t, code)
	}
	version, err := a.applySchedule(ctx, d, ev)
	if errors.Is(err, errUnappliable) {
		return a.exports.Hold(ctx, a.ids.NewID(), t, ErrorUnappliable)
	}
	if err != nil {
		return err
	}
	if err := a.calendars.UpdateLink(ctx, l.ID, ev.ETag, version); err != nil {
		return err
	}
	return a.resolve(ctx, open)
}

// acceptSchedule は、カレンダー c の予定の対応 l の単発の予定を、buddy での変更によらず外部の予定 ev の内容にする。
// トランザクションの中で呼ぶ。外部の変更を読み替えられないときは errUnappliable を返す。
func (a applier) acceptSchedule(ctx context.Context, c ExternalCalendar, l Link, ev Event) error {
	d, err := a.schedules.GetForUpdate(ctx, *l.ScheduleID)
	if err != nil {
		return err
	}
	version := d.Version
	if !isSameSchedule(d, c.StaffID, ev) {
		if version, err = a.applySchedule(ctx, d, ev); err != nil {
			return err
		}
	}
	return a.calendars.UpdateLink(ctx, l.ID, ev.ETag, version)
}

// syncRecurring は、繰り返しの予定に対応する外部の繰り返しの予定 ev の変更を確認する。
// 繰り返しの予定そのもの（規則、時刻、タイトル）の外部での変更と削除は buddy に当てず、確認が必要な待ちにする。
func (a applier) syncRecurring(ctx context.Context, l Link, ev Event) error {
	rs, err := a.recurring.GetForUpdate(ctx, *l.RecurringScheduleID)
	if err != nil {
		return err
	}
	t := Target{FacilityID: rs.FacilityID, RecurringScheduleID: rs.ID}
	open, err := a.open(ctx, t)
	if err != nil {
		return err
	}
	if isSameRecurring(rs, ev) {
		return a.sameContent(ctx, l, rs.Version, ev, open)
	}
	code := ErrorUnappliable
	switch {
	case ev.Status == StatusCancelled:
		code = ErrorNotFound
	case !isSynced(l, rs.Version):
		code = ErrorPreconditionFailed
	}
	return a.exports.Hold(ctx, a.ids.NewID(), t, code)
}

// syncOccurrence は、繰り返しの予定 parent の回で、まだ buddy の予定と対応の無い外部の例外の回 ev を当てる。
// 取り消した回は、繰り返しの予定から除外する。変えた回は、元の回を除外し、回を置き換える単発の予定を作って対応を書く。
// buddy でもその回を除外していれば、変えた回は両方が変わったので、確認が必要な待ちにする。取り消した回は、buddy がその回を
// 置き換え、親の予定の EXDATE をまだ書き出していないときだけ、確認が必要な待ちにする。書き出した後なら、親の EXDATE が
// 戻ってきたものとみなす。
func (a applier) syncOccurrence(ctx context.Context, c ExternalCalendar, parent Link, ev Event) error {
	rs, err := a.recurring.GetForUpdate(ctx, *parent.RecurringScheduleID)
	if err != nil {
		return err
	}
	t := Target{FacilityID: rs.FacilityID, RecurringScheduleID: rs.ID}
	if _, err := a.open(ctx, t); err != nil {
		return err
	}
	date, ok := originalDate(ev)
	occurs := ok && rs.HasOccurrenceOn(date)
	excluded := occurs && slices.Contains(rs.ExclusionDates, date)
	if ev.Status == StatusCancelled {
		if !occurs {
			return nil
		}
		if excluded {
			if isSynced(parent, rs.Version) {
				return nil
			}
			replaced, err := a.replaced(ctx, rs.ID, date)
			if err != nil || !replaced {
				return err
			}
			return a.exports.Hold(ctx, a.ids.NewID(), t, ErrorPreconditionFailed)
		}
		if err := a.recurring.AddExclusion(ctx, rs.ID, date); err != nil {
			return err
		}
		return a.syncedParent(ctx, parent, rs.Version)
	}
	switch {
	case !occurs:
		return a.exports.Hold(ctx, a.ids.NewID(), t, ErrorUnappliable)
	case excluded:
		return a.exports.Hold(ctx, a.ids.NewID(), t, ErrorPreconditionFailed)
	}
	sc, err := a.newSchedule(ctx, rs.Slot, rs.Visit, ev)
	if errors.Is(err, errUnappliable) {
		return a.exports.Hold(ctx, a.ids.NewID(), t, ErrorUnappliable)
	}
	if err != nil {
		return err
	}
	sc.RecurringScheduleID, sc.OriginalDate = &rs.ID, &date
	if err := a.recurring.AddExclusion(ctx, rs.ID, date); err != nil {
		return err
	}
	if err := a.schedules.Create(ctx, sc); err != nil {
		return err
	}
	version, recurringEventID := createdVersion, parent.ExternalEventID
	if err := a.calendars.CreateLink(ctx, Link{
		ID: a.ids.NewID(), FacilityID: rs.FacilityID, ExternalCalendarID: c.ID, ExternalEventID: ev.ID,
		RecurringEventID: &recurringEventID, ETag: ev.ETag, SyncedVersion: &version, ScheduleID: &sc.ID,
	}); err != nil {
		return err
	}
	return a.syncedParent(ctx, parent, rs.Version)
}

// sameContent は、外部の予定 ev が buddy の予定を書き出した内容と同じときに、予定の対応 l を ev の etag にする。
// buddy の更新の番号 version が対応と同じなら、対応の番号も進め、確認が必要な待ち open を終える。
// 違えば、比べない項目（説明、繰り返しの除外の日）に書き出していない buddy の変更があるので、番号は進めず、
// 確認が必要な待ちを書き直す待ちにして、buddy の変更を書き出させる。
func (a applier) sameContent(ctx context.Context, l Link, version int, ev Event, open *Export) error {
	if isSynced(l, version) || l.SyncedVersion == nil {
		if err := a.calendars.UpdateLink(ctx, l.ID, ev.ETag, version); err != nil {
			return err
		}
		return a.resolve(ctx, open)
	}
	if err := a.calendars.UpdateLink(ctx, l.ID, ev.ETag, *l.SyncedVersion); err != nil {
		return err
	}
	if open != nil && open.IsInReview() {
		return a.exports.Retry(ctx, open.ID)
	}
	return nil
}

// syncedParent は、外部の回を当てる前の繰り返しの予定の更新の番号 before が予定の対応と同じなら、予定の対応を今の更新の番号にする。
// 外部の回を当てて増えた番号を、buddy の変更と見誤らないためである。
func (a applier) syncedParent(ctx context.Context, parent Link, before int) error {
	if !isSynced(parent, before) {
		return nil
	}
	rs, err := a.recurring.Get(ctx, *parent.RecurringScheduleID)
	if err != nil {
		return err
	}
	return a.calendars.UpdateLink(ctx, parent.ID, parent.ETag, rs.Version)
}

// replaced は、繰り返しの予定 recurringScheduleID の d の回を buddy で置き換えた、キャンセルしていない単発の予定があるかを返す。
func (a applier) replaced(ctx context.Context, recurringScheduleID string, d civil.Date) (bool, error) {
	r, err := a.schedules.ReplacementOf(ctx, recurringScheduleID, d)
	if errors.Is(err, apperr.ErrNotFound) {
		return false, nil
	}
	return err == nil && r.Cancel == nil, err
}

// open は、t の終わっていない書き出しの待ちを返し、無ければ nil を返す。待ちを書いている処理があれば errExportWriting を返す。
func (a applier) open(ctx context.Context, t Target) (*Export, error) {
	e, err := a.exports.Open(ctx, t)
	if errors.Is(err, apperr.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if e.IsWriting(a.now()) {
		return nil, errExportWriting
	}
	return &e, nil
}

// resolve は、外部と buddy の予定が同じになったので、確認が必要な待ち open を終える。
func (a applier) resolve(ctx context.Context, open *Export) error {
	if open == nil || !open.IsInReview() {
		return nil
	}
	return a.exports.Resolve(ctx, open.ID, open.Revision)
}

// applySchedule は、単発の予定 d を外部の予定 ev の内容にし、更新の後の更新の番号を返す。
// 消された予定はキャンセルする。読み替えられないときは errUnappliable を返す。
func (a applier) applySchedule(ctx context.Context, d schedule.Detail, ev Event) (int, error) {
	if ev.Status == StatusCancelled {
		if d.Cancel != nil {
			return d.Version, nil
		}
		c, err := schedule.NewCancellation(a.ids.NewID(), d.ID, cancelledInGoogle)
		if err != nil {
			return 0, err
		}
		if err := a.schedules.CreateCancel(ctx, c); err != nil {
			return 0, err
		}
		return a.version(ctx, d.ID)
	}
	// buddy でキャンセルした予定は、外部で戻されても戻さない。
	if d.Cancel != nil {
		return 0, errUnappliable
	}
	slot, typ, err := a.slotOf(ctx, d.Slot, d.Visit, ev)
	if err != nil {
		return 0, err
	}
	keep := d.Visit != nil && isSameVisit(d.Visit, ev)
	switch {
	case keep:
		if err := a.requireKeepable(ctx, d.FacilityID, d.Visit.PatientID, slot.Date); err != nil {
			return 0, err
		}
		slot.VisitInfoID = d.VisitInfoID
	case d.Visit != nil:
		if slot.VisitInfoID, err = a.createVisit(ctx, d.FacilityID, d.Visit, ev); err != nil {
			return 0, err
		}
	}
	sc, err := schedule.New(d.ID, slot, typ)
	if err != nil {
		return 0, unappliable(err)
	}
	if err := a.schedules.Update(ctx, sc); err != nil {
		return 0, err
	}
	if !keep && d.VisitInfoID != nil {
		if err := a.visits.DeleteIfUnused(ctx, *d.VisitInfoID); err != nil {
			return 0, err
		}
	}
	return a.version(ctx, d.ID)
}

// newSchedule は、繰り返しの予定の枠 base と訪問の情報 v から、外部の回 ev の内容の単発の予定を作る。訪問の情報は新しく書く。
func (a applier) newSchedule(ctx context.Context, base schedule.Slot, v *visit.Detail, ev Event) (schedule.Schedule, error) {
	slot, typ, err := a.slotOf(ctx, base, v, ev)
	if err != nil {
		return schedule.Schedule{}, err
	}
	if v != nil {
		if slot.VisitInfoID, err = a.createVisit(ctx, base.FacilityID, v, ev); err != nil {
			return schedule.Schedule{}, err
		}
	}
	sc, err := schedule.New(a.ids.NewID(), slot, typ)
	if err != nil {
		return schedule.Schedule{}, unappliable(err)
	}
	return sc, nil
}

// slotOf は、予定の枠 base を外部の予定 ev の日時とタイトルにした枠と、予定の種類を返す。職員と説明は base のままにする。
// 訪問の予定では、訪問の情報を空にして返す。タイトルのサービス内容と利用者名が v と同じときは、呼ぶ側が前の訪問の情報を使う。
// ev を読み替えられないか、訪問の予定と通常の予定が入れ替わるときは errUnappliable を返す。
func (a applier) slotOf(ctx context.Context, base schedule.Slot, v *visit.Detail, ev Event) (schedule.Slot, schedule.Type, error) {
	c := Classify(ev)
	if c.Kind == KindSkipped || (c.Kind == KindVisit) != (v != nil) {
		return schedule.Slot{}, schedule.Type{}, errUnappliable
	}
	typ, err := a.typeOf(ctx, base.TypeID)
	if err != nil {
		return schedule.Slot{}, schedule.Type{}, err
	}
	slot := schedule.Slot{
		FacilityID: base.FacilityID, StaffID: base.StaffID, Date: c.Date, StartTime: c.StartTime, EndTime: c.EndTime,
		EndsNextDay: c.EndsNextDay, Description: base.Description,
	}
	if v == nil {
		title := c.Title
		slot.Title = &title
	}
	return slot, typ, nil
}

// createVisit は、訪問の情報 v を、外部の予定 ev のタイトルのサービス内容と利用者名にして書き、ID を返す。担当、同行、訪問の区分は v のままにする。
// タイトルがサービス内容か利用者名を変えていて、サービスコードか利用者を 1 つに引けないときは errUnappliable を返す。
// 利用の終了の利用者は、今日より前の予定で、v の利用者のままのときだけ書ける（ADR-0021）。書けないときも errUnappliable を返す。
func (a applier) createVisit(ctx context.Context, facilityID string, v *visit.Detail, ev Event) (*string, error) {
	in := visit.Input{
		PatientID: v.PatientID, AssignedStaffID: v.AssignedStaffID, CompanionID: v.CompanionID, ServiceCodeID: v.ServiceCodeID,
		CategoryIDs: make([]string, len(v.Categories)),
	}
	for i, c := range v.Categories {
		in.CategoryIDs[i] = c.ID
	}
	c := Classify(ev)
	if c.Date.Before(civil.Today(a.now())) {
		in.KeptPatientID = v.PatientID
	}
	if serviceKey(c.Service) != serviceKey(v.ServiceCode) {
		id, err := a.serviceCodeID(ctx, c.Service)
		if err != nil {
			return nil, err
		}
		in.ServiceCodeID = id
	}
	if gcaltitle.NormalizeClient(c.Client) != gcaltitle.NormalizeClient(v.PatientName) {
		id, err := a.patientID(ctx, facilityID, c.Client)
		if err != nil {
			return nil, err
		}
		in.PatientID = id
	}
	id, err := a.visits.Create(ctx, facilityID, in)
	if err != nil {
		return nil, unappliable(err)
	}
	return &id, nil
}

// isSameVisit は、外部の予定 ev のタイトルが、訪問の情報 v のサービス内容と利用者名と同じかを返す。
func isSameVisit(v *visit.Detail, ev Event) bool {
	c := Classify(ev)
	return serviceKey(c.Service) == serviceKey(v.ServiceCode) && gcaltitle.NormalizeClient(c.Client) == gcaltitle.NormalizeClient(v.PatientName)
}

func (a applier) serviceCodeID(ctx context.Context, service string) (string, error) {
	codes, err := a.serviceCodes.ListServiceCodes(ctx)
	if err != nil {
		return "", err
	}
	for _, sc := range codes {
		if serviceKey(sc.Code) == serviceKey(service) {
			return sc.ID, nil
		}
	}
	return "", errUnappliable
}

// requireKeepable は、利用者 patientID の訪問の情報を、date の予定に付けたまま保存できるかを確認する。
// 利用の終了の利用者は、今日より前の予定でだけ保存でき、今日以降なら errUnappliable を返す（ADR-0021）。
func (a applier) requireKeepable(ctx context.Context, facilityID, patientID string, date civil.Date) error {
	if date.Before(civil.Today(a.now())) {
		return nil
	}
	pats, err := a.patients.ListByFacility(ctx, facilityID, patient.ListQuery{Sort: kernel.Sort{Field: "name"}})
	if err != nil {
		return err
	}
	if !slices.ContainsFunc(pats, func(p patient.Detail) bool { return p.ID == patientID }) {
		return errUnappliable
	}
	return nil
}

// patientID は、タイトルの利用者名 client の事業所の利用者を 1 人に引けたときに、その ID を返す。
func (a applier) patientID(ctx context.Context, facilityID, client string) (string, error) {
	pats, err := a.patients.ListByFacility(ctx, facilityID, patient.ListQuery{Sort: kernel.Sort{Field: "name"}})
	if err != nil {
		return "", err
	}
	key := gcaltitle.NormalizeClient(client)
	var foundIDs []string
	for _, p := range pats {
		if gcaltitle.NormalizeClient(p.Name) == key {
			foundIDs = append(foundIDs, p.ID)
		}
	}
	if len(foundIDs) != 1 {
		return "", errUnappliable
	}
	return foundIDs[0], nil
}

func (a applier) typeOf(ctx context.Context, id string) (schedule.Type, error) {
	types, err := a.types.List(ctx)
	if err != nil {
		return schedule.Type{}, err
	}
	for _, t := range types {
		if t.ID == id {
			return t, nil
		}
	}
	return schedule.Type{}, apperr.ErrNotFound
}

func (a applier) version(ctx context.Context, id string) (int, error) {
	d, err := a.schedules.Get(ctx, id)
	return d.Version, err
}

// isSameRecurring は、外部の繰り返しの予定 ev が、繰り返しの予定 rs を書き出した内容と同じかを返す。
// RRULE は、両方を RecurrenceOf で同じ形にしてから比べる。EXDATE は比べない。外部で取り消した回は、親の EXDATE ではなく
// 例外の回で来るので、buddy の除外の日と親の EXDATE は一致しないためである。回の変更は syncOccurrence が当てる。
func isSameRecurring(rs schedule.RecurringDetail, ev Event) bool {
	if ev.Status == StatusCancelled {
		return false
	}
	c := Classify(ev)
	if c.Kind == KindSkipped || c.Date != rs.Date || c.StartTime != rs.StartTime || c.EndTime != rs.EndTime ||
		c.EndsNextDay != rs.EndsNextDay {
		return false
	}
	if ev.Summary != RecurringBody(rs, nil).Summary {
		return false
	}
	rec, err := RuleFromRecurrence(ev)
	if err != nil {
		return false
	}
	got := RecurrenceOf(schedule.RecurringSchedule{Slot: rs.Slot, Rule: rec.Rule}, nil)
	return slices.Equal(got, RecurrenceOf(rs.RecurringSchedule, nil))
}

// isSameSchedule は、職員 staffID のカレンダーの外部の予定 ev が、単発の予定 d を書き出した内容と同じかを返す。
// buddy で職員を替えた予定は、前の職員のカレンダーの予定と同じとみなさない。説明は比べない。
func isSameSchedule(d schedule.Detail, staffID string, ev Event) bool {
	if d.StaffID != staffID {
		return false
	}
	if ev.Status == StatusCancelled {
		return d.Cancel != nil
	}
	if d.Cancel != nil {
		return false
	}
	c := Classify(ev)
	return c.Kind != KindSkipped && c.Date == d.Date && c.StartTime == d.StartTime && c.EndTime == d.EndTime &&
		c.EndsNextDay == d.EndsNextDay && ev.Summary == ScheduleBody(d).Summary
}

// isSynced は、予定の対応 l が、更新の番号 version の時点で外部の予定と同じにしたものかを返す。
func isSynced(l Link, version int) bool {
	return l.SyncedVersion != nil && *l.SyncedVersion == version
}

// unappliable は、入力のエラーを errUnappliable にする。ほかのエラーはそのまま返す。
func unappliable(err error) error {
	if errors.Is(err, apperr.ErrInvalidInput) {
		return errUnappliable
	}
	return err
}
