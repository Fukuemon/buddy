package scheduleview

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"slices"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// ProjectionStatus は、Projection の予定の状態である。
type ProjectionStatus string

// ProjectionStatus の値。
const (
	ProjectionConfirmed ProjectionStatus = "confirmed"
	// ProjectionCancelled は、Google で取り消した予定である。繰り返しの予定の取り消した回のほか、取り消した単発の予定と繰り返しの親も
	// この状態の行に残す。一覧には出さない。
	ProjectionCancelled ProjectionStatus = "cancelled"
)

// ProjectionTime は、Projection の予定の開始、終了、元の開始である。終日の予定は Date だけを、時刻のある予定は At だけを持つ。
// 取り消した回の開始と終了は、どちらも持たない。
type ProjectionTime struct {
	At   *time.Time
	Date *civil.Date
}

// Projection は、Google カレンダーを予定の正本にする事業所（google_primary）の、Google カレンダーの 1 つの予定の写しである（ADR-0028）。
// calendarsync の同期の処理だけが書き、scheduleview だけが読む。繰り返しの予定は展開せず、親の予定と例外の回を別の行に持つ。
// 説明、場所、参加者、作成者と主催者のメール、添付は持たない。タイトルは利用者名を含むが、表示と照合に要るので持つ。
type Projection struct {
	// ExternalCalendarID は、結び付けたカレンダー（calendar.ExternalCalendar）の ID である。EventID との組で 1 行に決まる。
	ExternalCalendarID string
	// EventID は、Google の予定の ID である。
	EventID string
	// FacilityID と StaffID は、写した時点のカレンダーの事業所と職員である。
	FacilityID string
	StaffID    string
	// RecurringEventID は、例外の回の親の予定の ID で、例外の回でなければ空である。
	RecurringEventID string
	// OriginalStart は、例外の回が元の規則で始まるはずだった日時である。
	OriginalStart ProjectionTime
	Status        ProjectionStatus
	Title         string
	Start         ProjectionTime
	End           ProjectionTime
	// TimeZone は、Google の予定の開始に付いた IANA のタイムゾーンの名前で、無ければ空である。繰り返しの規則はこの暦で数える。
	TimeZone string
	// Recurrence は、繰り返しの親の予定の RRULE、EXDATE、RDATE の行で、親でなければ空である。
	Recurrence []string
	ETag       string
	// GoogleUpdatedAt は、Google で予定を最後に変えた時刻で、Google が返さなければ nil である。
	GoogleUpdatedAt *time.Time
	// LastEndDate は、Asia/Tokyo で予定が終わる日で、繰り返しの予定は最後の回が終わる日、取り消した回は元の開始の日である。
	// 終わりの無い繰り返しと、規則から最後の回を決められない繰り返しでは nil である。保持する期間より前に終わった行を消すのに使う。
	LastEndDate *civil.Date
	// ProjectedAt は、同期が行を書いた時刻である。
	ProjectedAt time.Time
}

// ProjectionDetail は、Projection の行と、行のカレンダーの職員の名前である。
type ProjectionDetail struct {
	Projection
	StaffName string
	// ScheduleID は、行の予定の一覧での ID である。予定の API が Google に書いた予定の記録（calendar.EventRecord）が行の予定を指せば
	// 記録の予定の ID で、記録が無ければ ListScheduleID の値である。
	ScheduleID string
	// Visit は、記録の、Google が受けたと分かった版の訪問の情報（calendar.EventRecord.VisitInfoID）を、名前と区分を付けたものである。
	// 記録が無いか、記録が訪問の情報を持たない（通常の予定、確定した版の無い記録）ときは nil である。保留の版の訪問の情報は使わない。
	Visit *visit.Detail
}

// IsParent は、行が繰り返しの親の予定かを返す。
func (p Projection) IsParent() bool { return len(p.Recurrence) > 0 }

// IsException は、行が繰り返しの予定の例外の回（変えた回か取り消した回）かを返す。
func (p Projection) IsException() bool { return p.RecurringEventID != "" }

// day は、t の Asia/Tokyo の日付を返す。開始と終了の無い t（取り消した回の開始）では false を返す。
func (t ProjectionTime) day() (civil.Date, bool) {
	switch {
	case t.At != nil:
		return civil.Today(*t.At), true
	case t.Date != nil:
		return *t.Date, true
	}
	return civil.Date{}, false
}

// projectedEvent は、Projection の 1 つの予定か、繰り返しの親を展開した 1 回を、読み替えた結果である。
type projectedEvent struct {
	row     ProjectionDetail
	reading EventReading
	// occurrence は、繰り返しの親を展開した回の日付で、展開した回でなければゼロ値である。
	occurrence civil.Date
	// unsupported は、buddy の繰り返しの規則に写せない繰り返しの親を、最初の回の 1 件にしたときに true である。
	unsupported bool
	// left は、展開した回の OccurrenceScheduleID が、ほかの予定を指す記録の主キーと同じときに true である。回を別の職員の
	// カレンダーに移した後に、元のカレンダーの回を Google から消せずに残ったときに当たる。一覧での ID を DetachedOccurrenceScheduleID にする。
	left bool
}

// expandProjections は、Projection の行 rows を読み替え、from から to までの日に始まる予定と、from の前の日に始まり from に終わる予定を返す。
// 繰り返しの親は、規則（rules.Recurrence）で from から to までの回に展開し、除外する日（EXDATE）と、例外の回が置き換えた元の日を除く。
// 規則に写せない繰り返しの親は、回に展開せず、最初の回を、回が期間に重なりうるときに 1 件で返す。
// 例外の回は、変えた回を単発の予定と同じく読み替え、取り消した回は返さない。rules.Read が読み替えない予定（終日の予定など）は返さない。
// 取り消した単発の予定と繰り返しの親は返さず、取り消した親の例外の回も返さない。
// 展開した回の残った回（left）は、markLeft で決める。
func expandProjections(rows []ProjectionDetail, rules EventRules, from, to civil.Date) []projectedEvent {
	replaced := map[string]map[civil.Date]bool{}
	cancelled := map[string]bool{}
	for _, r := range rows {
		if r.Status == ProjectionCancelled && !r.IsException() {
			cancelled[r.ExternalCalendarID+"\x00"+r.EventID] = true
		}
		if !r.IsException() {
			continue
		}
		d, ok := r.OriginalStart.day()
		if !ok {
			continue
		}
		key := r.ExternalCalendarID + "\x00" + r.RecurringEventID
		if replaced[key] == nil {
			replaced[key] = map[civil.Date]bool{}
		}
		replaced[key][d] = true
	}
	var out []projectedEvent
	for _, r := range rows {
		switch {
		case r.Status != ProjectionConfirmed, r.IsException() && cancelled[r.ExternalCalendarID+"\x00"+r.RecurringEventID]:
		case r.IsParent():
			out = append(out, expandParent(r, rules, replaced[r.ExternalCalendarID+"\x00"+r.EventID], from, to)...)
		default:
			if rd := rules.Read(r.Projection); rd.Kind != EventSkipped && startsIn(rd, from, to) {
				out = append(out, projectedEvent{row: r, reading: rd})
			}
		}
	}
	return out
}

// expandParent は、繰り返しの親の予定 r を、from から to までの回に展開する。replaced は、例外の回が置き換えた元の日である。
func expandParent(r ProjectionDetail, rules EventRules, replaced map[civil.Date]bool, from, to civil.Date) []projectedEvent {
	first := rules.Read(r.Projection)
	if first.Kind == EventSkipped {
		return nil
	}
	rule, exclusions, err := rules.Recurrence(r.Projection)
	if err != nil {
		if first.Date.After(to) || (r.LastEndDate != nil && r.LastEndDate.Before(dayBefore(from))) {
			return nil
		}
		return []projectedEvent{{row: r, reading: first, unsupported: true}}
	}
	rs := schedule.RecurringSchedule{Slot: schedule.Slot{Date: first.Date}, Rule: rule}
	var out []projectedEvent
	for d := dayBefore(from); !d.After(to); d = civil.DateOf(d.Time().AddDate(0, 0, 1)) {
		if !rs.HasOccurrenceOn(d) || replaced[d] || slices.Contains(exclusions, d) {
			continue
		}
		occ := first
		occ.Date = d
		if startsIn(occ, from, to) {
			out = append(out, projectedEvent{row: r, reading: occ, occurrence: d})
		}
	}
	return out
}

// startsIn は、rd が from から to までの日に始まるか、from の前の日に始まり from に終わる予定かを返す（ADR-0032）。
func startsIn(rd EventReading, from, to civil.Date) bool {
	if rd.EndsNextDay && rd.Date == dayBefore(from) {
		return true
	}
	return !rd.Date.Before(from) && !rd.Date.After(to)
}

func dayBefore(d civil.Date) civil.Date { return civil.DateOf(d.Time().AddDate(0, 0, -1)) }

// projectedID は、Projection の予定 e の、一覧を読むたびに同じになる ID を返す。展開した回でなければ、行の一覧での ID（ScheduleID）にする。
// 繰り返しの回は OccurrenceScheduleID にする。
func projectedID(e projectedEvent) string {
	switch {
	case e.occurrence.IsZero():
		return e.row.ScheduleID
	case e.left:
		return DetachedOccurrenceScheduleID(e.row.ExternalCalendarID, e.row.EventID, e.occurrence)
	}
	return OccurrenceScheduleID(e.row.ExternalCalendarID, e.row.EventID, e.occurrence)
}

// occurrenceIDOf は、展開した回 e の OccurrenceScheduleID を返す。
func occurrenceIDOf(e projectedEvent) string {
	return OccurrenceScheduleID(e.row.ExternalCalendarID, e.row.EventID, e.occurrence)
}

// markLeft は、展開した回 events のうち、回の OccurrenceScheduleID を主キーに持つ記録が、回を移した先の予定を指す回を、残った回（left）にする。
// 記録は recorded で 1 回にまとめて引く。移した先の単発の予定が読む日付の範囲の外にあっても、残った回の ID を変えないためである。
func markLeft(ctx context.Context, recorded RecordedEvents, facilityID string, events []projectedEvent) error {
	var ids []string
	for _, e := range events {
		if !e.occurrence.IsZero() {
			ids = append(ids, occurrenceIDOf(e))
		}
	}
	if len(ids) == 0 {
		return nil
	}
	recs, err := recorded.ListRecordedEvents(ctx, facilityID, ids)
	if err != nil {
		return err
	}
	for i, e := range events {
		if !e.occurrence.IsZero() {
			events[i].left = movedAway(e, recs)
		}
	}
	return nil
}

// movedAway は、展開した回 e の OccurrenceScheduleID を主キーに持つ記録が、回を移した先の予定を指すかを返す。
// 確定した版の予定の Projection の行が、e の親の予定の例外の回でない記録が当たる。回を移すと、記録は移した先の単発の予定を指し、
// 移さない回の記録は、その回の Google の予定（親の予定の例外の回）を指すためである。カレンダーでは比べない。別の職員へ移した回を
// 元の職員へ戻すと、記録は元のカレンダーの単発の予定を指すためである。Google の回の予定の ID の形にも頼らない。
// 保留の版だけを持つ記録（訪問の情報を初めて変える書き込みや、移す書き込みの結果が分からない記録）と、指す予定の Projection の行が無い記録は、
// recs に入らないので当たらない。回は元の ID のままで、保留の版か記録で書き込みを拒む。
func movedAway(e projectedEvent, recs map[string]RecordedEvent) bool {
	rec, ok := recs[occurrenceIDOf(e)]
	return ok && (rec.ExternalCalendarID != e.row.ExternalCalendarID || rec.RecurringEventID != e.row.EventID)
}

// OccurrenceScheduleID は、結び付けたカレンダー externalCalendarID の繰り返しの予定 parentEventID の、元の規則で d に始まる回の、
// 一覧での予定の ID を返す。展開した回と、回を変えた例外の回の記録の無い行に使い、回を変えても ID が変わらない（ADR-0028）。
// ProjectedScheduleID と同じ形で作り、DB の関数 occurrence_schedule_id も同じ値を返す。
func OccurrenceScheduleID(externalCalendarID, parentEventID string, d civil.Date) string {
	return hashID(externalCalendarID + "\x00" + parentEventID + "\x00" + d.String())
}

// DetachedOccurrenceScheduleID は、記録の無い例外の回の行の OccurrenceScheduleID が、ほかの予定を指す記録の主キーと同じときの、
// 一覧での予定の ID を返す。回を別の職員のカレンダーに移すと、回の記録の主キーは移した単発の予定を指す。元の回を消せなかったとき、
// 元のカレンダーに残った例外の回の行は記録を持たず、同じ OccurrenceScheduleID になるので、この ID で見分ける。
// DetachedScheduleID と同じく、Google の予定の ID に使われない文字（0x01）と固定の語を親の予定の ID に足して作り、
// DB の関数 detached_occurrence_schedule_id も同じ値を返す。
func DetachedOccurrenceScheduleID(externalCalendarID, parentEventID string, d civil.Date) string {
	return OccurrenceScheduleID(externalCalendarID, parentEventID+"\x01detached", d)
}

// OriginalDate は、例外の回 p が元の規則で始まるはずだった Asia/Tokyo の日付を返す。元の開始が無ければ false を返す。
func (p Projection) OriginalDate() (civil.Date, bool) { return p.OriginalStart.day() }

// Occurrence は、繰り返しの予定の親の行 Parent を展開した、元の規則で Date に始まる 1 回である。
// ID は回の一覧での ID で、Left は、回を別の職員のカレンダーに移した後に元のカレンダーに残った回（ID が DetachedOccurrenceScheduleID）かである。
type Occurrence struct {
	Parent ProjectionDetail
	Date   civil.Date
	ID     string
	Left   bool
}

// FindOccurrence は、事業所 facilityID の Projection の行 rows の繰り返しの親を from から to までの回に展開し、一覧での ID が id の回を返す。
// 変えた回と取り消した回は、展開した回に含めない。残った回かは、一覧と同じく recorded の記録で決める。見つからなければ false を返す。
func FindOccurrence(ctx context.Context, recorded RecordedEvents, facilityID string, rows []ProjectionDetail, rules EventRules, id string,
	from, to civil.Date) (Occurrence, bool, error) {
	e, ok, err := findOccurrence(ctx, recorded, facilityID, rows, rules, id, from, to)
	return Occurrence{Parent: e.row, Date: e.occurrence, ID: id, Left: e.left}, ok, err
}

// findOccurrence は、OccurrenceScheduleID か DetachedOccurrenceScheduleID が id の展開した回を候補にし、候補の回の記録を 1 回で引いて、
// 一覧と同じ ID になる回を返す。
func findOccurrence(ctx context.Context, recorded RecordedEvents, facilityID string, rows []ProjectionDetail, rules EventRules, id string,
	from, to civil.Date) (projectedEvent, bool, error) {
	var candidates []projectedEvent
	var ids []string
	for _, e := range expandProjections(rows, rules, from, to) {
		if e.occurrence.IsZero() {
			continue
		}
		e.left = true
		if projectedID(e) == id || occurrenceIDOf(e) == id {
			candidates = append(candidates, e)
			ids = append(ids, occurrenceIDOf(e))
		}
	}
	if len(candidates) == 0 {
		return projectedEvent{}, false, nil
	}
	recs, err := recorded.ListRecordedEvents(ctx, facilityID, ids)
	if err != nil {
		return projectedEvent{}, false, err
	}
	for _, e := range candidates {
		e.left = movedAway(e, recs)
		if projectedID(e) == id {
			return e, true, nil
		}
	}
	return projectedEvent{}, false, nil
}

// RetainedRange は、今の時刻 now の、Projection を保持する期間（前々月の初日から 3 か月後の月末）の最初の日と最後の日を返す（ADR-0028）。
// 一覧での ID から繰り返しの回を引くときに、親を展開する期間にする。
func RetainedRange(now time.Time) (civil.Date, civil.Date) {
	return projectionRange(ListQuery{}, now)
}

// ProjectedScheduleID は、記録の無い Projection の予定の、一覧を読むたびに同じになる予定の ID を返す。
// Google の予定の ID は ULID の形でないので、結び付けたカレンダーの ID externalCalendarID と Google の予定の ID eventID から、
// ULID と同じ 26 文字の Crockford の Base32 で作る。DB の関数 projected_schedule_id も同じ値を返す。
func ProjectedScheduleID(externalCalendarID, eventID string) string {
	return hashID(externalCalendarID + "\x00" + eventID)
}

// DetachedScheduleID は、記録の無い Projection の予定の ProjectedScheduleID が、ほかの予定を指す記録の主キーと同じときの、一覧での予定の ID を返す。
// Google で作った予定を buddy で変えると、記録の主キーはその予定の ProjectedScheduleID になる。予定を別のカレンダーに移した後に
// 前のカレンダーに残った予定は、記録を持たず同じ ProjectedScheduleID になるので、この ID で見分ける。
// Google の予定の ID に使われない文字（0x01）と固定の語を足して作り、DB の関数 detached_schedule_id も同じ値を返す。
func DetachedScheduleID(externalCalendarID, eventID string) string {
	return ProjectedScheduleID(externalCalendarID, eventID+"\x01detached")
}

// ListScheduleID は、記録の無い Projection の予定の、一覧での予定の ID を返す。hashTaken は、予定の ProjectedScheduleID が、
// ほかの予定を指す記録の主キーと同じかである。同じなら DetachedScheduleID を、違えば ProjectedScheduleID を返す。
func ListScheduleID(externalCalendarID, eventID string, hashTaken bool) string {
	if hashTaken {
		return DetachedScheduleID(externalCalendarID, eventID)
	}
	return ProjectedScheduleID(externalCalendarID, eventID)
}

// hashID は、key の SHA-256 の先頭の 128 ビットを、ULID と同じ 26 文字の Crockford の Base32 にする。
func hashID(key string) string {
	sum := sha256.Sum256([]byte(key))
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	// 128 ビットを 5 ビットずつ 26 文字にする。先頭の文字は上位の 3 ビットだけなので、ULID と同じく 0〜7 になる。
	hi, lo := binary.BigEndian.Uint64(sum[:8]), binary.BigEndian.Uint64(sum[8:16])
	var b [26]byte
	for i := 25; i >= 0; i-- {
		b[i] = alphabet[lo&31]
		lo = lo>>5 | hi<<59
		hi >>= 5
	}
	return string(b[:])
}
