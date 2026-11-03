package check

import (
	"github.com/Fukuemon/buddy/services/receipt/internal/judge"
	"github.com/Fukuemon/buddy/services/receipt/internal/record"
)

// Summary は、区分ごとの行の数である。
type Summary struct {
	Mismatch     int
	ScheduleOnly int
	VisitOnly    int
	Match        int
}

// Report は、照合の結果である。Rows は judge.All の順に並ぶ。
type Report struct {
	Summary Summary
	Rows    []judge.Result
	// Warnings は、予定のデータソースが照合に使わなかった予定である。無ければ空の配列である。
	Warnings []record.Warning
}
