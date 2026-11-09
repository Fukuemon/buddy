package calendar

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// StaffRefs は、カレンダーを結び付ける職員と、その状態を読む。
type StaffRefs interface {
	kernel.Finder[staff.Ref]
}
