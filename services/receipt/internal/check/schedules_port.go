package check

import (
	"context"

	"github.com/Fukuemon/buddy/services/receipt/internal/csvio"
	"github.com/Fukuemon/buddy/services/receipt/internal/normalize"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

// ScheduleSource は、照合に使う予定を返す。返す Record は normalize.Schedules を通した後の値である。
// 照合に使わなかった予定は record.Warning で返す。
// 入力のエラーは *record.InputError で、データソースから予定を取れないときは *SourceError で返す。
type ScheduleSource interface {
	Schedules(ctx context.Context) ([]record.Record, []record.Warning, error)
}

// SourceError は、予定のデータソースから予定を取れないことを表す。入力のエラーではない。
type SourceError struct {
	Message string
	Err     error
}

func (e *SourceError) Error() string {
	return e.Message + ": " + e.Err.Error()
}

func (e *SourceError) Unwrap() error {
	return e.Err
}

// CSVSchedules は、予定の CSV から予定を読む ScheduleSource である。
type CSVSchedules struct {
	Data []byte
}

// Schedules は、Data を予定の CSV として読む。警告は返さない。
func (s CSVSchedules) Schedules(_ context.Context) ([]record.Record, []record.Warning, error) {
	recs, err := readCSV(s.Data, record.InputSchedule, csvio.ScheduleColumns(), normalize.Schedules, "予定の CSV に誤りがある")
	return recs, nil, err
}
