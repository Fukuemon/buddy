// Package inmem は、全リポジトリと Transactor と IDGenerator の、テストのためのメモリ上の実装を持つ。本番のコードから使わない。
package inmem

import (
	"context"
	"fmt"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarimport"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarsync"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendarwrite"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/patient"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/scheduleview"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// Tx は、fn をそのまま呼ぶ tx.Transactor である。Calls は WithinTx を呼んだ回数である。
type Tx struct{ Calls int }

// WithinTx は、呼んだ回数を数えて fn を呼ぶ。
func (t *Tx) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
	t.Calls++
	return fn(ctx)
}

// SeqIDs は、連番の ID を発行する kernel.IDGenerator である。
type SeqIDs struct{ n int }

// NewID は、次の連番の ID を返す。
func (s *SeqIDs) NewID() string {
	s.n++
	return fmt.Sprintf("NEW%023d", s.n)
}

// Store は、全リポジトリのメモリ上の実装が共有する値である。
type Store struct {
	Facilities    map[string]organization.Facility
	FacilityByOrg map[string]string
	Departments   map[string]organization.Department
	Teams         map[string]organization.Team
	Positions     map[string]organization.Position
	Policies      map[string]organization.Policy
	Staff         map[string]staff.Detail
	Grants        map[string][]staff.Grant
	Patients      map[string]patient.Detail
	Codes         map[string]servicecode.ServiceCode
	Categories    map[string]visit.Category
	Infos         map[string]visit.Info
	Types         map[string]schedule.Type
	Schedules     map[string]scheduleview.Detail
	Recurring     map[string]scheduleview.RecurringDetail
	Cancels       map[string]schedule.Cancellation
	Calendars     map[string]calendar.ExternalCalendar
	Runs          map[string]calendar.ImportRun
	Links         map[string]calendar.EventLink
	Exports       map[string]calendar.Export
	// SyncResults は、カレンダーの ID ごとの、最後に同期した結果である。
	SyncResults map[string]calendarsync.SyncResult
	// SyncedAt は、カレンダーの ID ごとの、変わった予定を最後まで読んで当てた最後の同期の時刻である。
	SyncedAt map[string]time.Time
	// Projections は、ProjectionKey ごとの、Google カレンダーの予定の写しである。
	Projections map[ProjectionKey]scheduleview.Projection
	// Cutovers は、切り替えの ID ごとの切り替えである。
	Cutovers map[string]calendarimport.Cutover
	// CutoverSkips は、切り替えの取り込みで、取り込まないを選んだ予定の記録である。
	CutoverSkips []calendarimport.CutoverSkip
	// Records は、予定の ID ごとの、Google カレンダーに書いた予定の記録である。
	Records map[string]calendarwrite.Record
}

// NewStore は、空の Store を作る。
func NewStore() *Store {
	return &Store{
		Facilities:    map[string]organization.Facility{},
		FacilityByOrg: map[string]string{},
		Departments:   map[string]organization.Department{},
		Teams:         map[string]organization.Team{},
		Positions:     map[string]organization.Position{},
		Policies:      map[string]organization.Policy{},
		Staff:         map[string]staff.Detail{},
		Grants:        map[string][]staff.Grant{},
		Patients:      map[string]patient.Detail{},
		Codes:         map[string]servicecode.ServiceCode{},
		Categories:    map[string]visit.Category{},
		Infos:         map[string]visit.Info{},
		Types:         map[string]schedule.Type{},
		Schedules:     map[string]scheduleview.Detail{},
		Recurring:     map[string]scheduleview.RecurringDetail{},
		Cancels:       map[string]schedule.Cancellation{},
		Calendars:     map[string]calendar.ExternalCalendar{},
		Runs:          map[string]calendar.ImportRun{},
		Links:         map[string]calendar.EventLink{},
		Exports:       map[string]calendar.Export{},
		SyncResults:   map[string]calendarsync.SyncResult{},
		SyncedAt:      map[string]time.Time{},
		Projections:   map[ProjectionKey]scheduleview.Projection{},
		Cutovers:      map[string]calendarimport.Cutover{},
		Records:       map[string]calendarwrite.Record{},
	}
}

func get[T any](m map[string]T, id string) (T, error) {
	v, ok := m[id]
	if !ok {
		var zero T
		return zero, apperr.ErrNotFound
	}
	return v, nil
}
