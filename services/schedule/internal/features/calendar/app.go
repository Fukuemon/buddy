package calendar

import (
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/schedule"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// 衝突の原因の code。httpapi が 409 のレスポンスの code にする。
const (
	// CodeCalendarTaken は、カレンダーがほかの職員に結び付いていることを表す。外したカレンダーを含む。
	CodeCalendarTaken = "calendar_taken"
	// CodeCalendarLinked は、カレンダーがその職員にすでに結び付いていることを表す。
	CodeCalendarLinked = "calendar_already_linked"
	// CodeStaffHasCalendar は、職員にほかのカレンダーが結び付いていることを表す。
	CodeStaffHasCalendar = "staff_has_calendar"
	// CodeImportRunning は、同じカレンダーの取り込みが進んでいることを表す。
	CodeImportRunning = "import_running"
	// CodeReviewChanged は、プレビューの後に確認が必要な予定が変わったことを表す。
	CodeReviewChanged = "import_preview_changed"
	// CodeExportNotInReview は、書き直そうとした書き出しが、確認が必要な状態でないことを表す。
	CodeExportNotInReview = "export_not_in_review"
	// CodeExportNotAcceptable は、外部のカレンダーの内容を buddy に当てられない書き出しであることを表す。
	// 繰り返しの予定と、書けなかった（failed）書き出しが当たる。
	CodeExportNotAcceptable = "export_not_acceptable"
	// CodeExternalChangeUnappliable は、外部のカレンダーの予定を buddy の予定に読み替えられないことを表す。
	CodeExternalChangeUnappliable = "external_change_unappliable"
)

// Deps は、App が使うリポジトリと、ほかの機能のデータを読み書きする小さなインターフェースである。
type Deps struct {
	Calendars Repository
	// Accounts は、事業所のサービスアカウントで外部のカレンダーを読む。設定が無ければ nil で、読む操作は ErrNotConfigured を返す。
	Accounts     Accounts
	Staff        StaffRefs
	Patients     Patients
	ServiceCodes ServiceCodes
	Types        Types
	// Schedules は、取り込んだ単発の予定を書き、外部のカレンダーの内容を当てる予定を読み書きする。
	Schedules ScheduleStore
	Recurring Recurring
	// RecurringSchedules は、前の取り込みで繰り返しのまま取り込んだ予定と、その除外の日を読む。
	RecurringSchedules kernel.Finder[schedule.RecurringDetail]
	Visits             VisitStore
	// Exports は、Google カレンダーへの書き出しの待ちを読み、書き直す待ちにする。
	Exports ExportRepository
}

// App は、外部のカレンダーの結び付けと、予定の取り込みと、確認が必要な書き出しの操作である。全ての操作は、guard が許すときだけ行う（ADR-0006）。
type App struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
	apply applier
}

// NewApp は App を作る。
func NewApp(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *App {
	return &App{deps: deps, tx: tx, ids: ids, guard: guard, apply: applier{
		calendars: deps.Calendars, exports: deps.Exports, schedules: deps.Schedules, types: deps.Types,
		patients: deps.Patients, serviceCodes: deps.ServiceCodes, visits: deps.Visits, ids: ids, now: time.Now,
	}}
}

var (
	errNotInReview   = apperr.ConflictCode(CodeExportNotInReview, "この予定は、確認が必要な書き出しではありません")
	errNotAcceptable = apperr.ConflictCode(CodeExportNotAcceptable,
		"この予定は、Google カレンダーの内容を buddy に当てられません。buddy の内容で書き直してください")
)
