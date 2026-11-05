package organization

import (
	"time"
)

// PolicyCode は、認可が読む権限の識別子である。権限のレコードはマイグレーションが入れ、全ての環境で同じである。
type PolicyCode string

// 予定の権限である。編集の権限は、同じ範囲の閲覧を含む。
const (
	ScheduleSelfEdit PolicyCode = "schedule.self.edit"
	ScheduleUserRead PolicyCode = "schedule.user.read"
	ScheduleUserEdit PolicyCode = "schedule.user.edit"
	ScheduleTeamRead PolicyCode = "schedule.team.read"
	ScheduleTeamEdit PolicyCode = "schedule.team.edit"
	ScheduleAllRead  PolicyCode = "schedule.all.read"
	ScheduleAllEdit  PolicyCode = "schedule.all.edit"
)

// StaffManage は、職員の権限を足し外し、役職を変える権限である（ADR-0006）。予定の範囲には及ばない。
const StaffManage PolicyCode = "staff.manage"

// ReceiptCheck は、照合の API が照合を許す権限である（ADR-0021）。予定の API の判定には使わない。
const ReceiptCheck PolicyCode = "receipt.check"

// IsTeamTarget は、権限の対象がチームであるかを返す。
func (c PolicyCode) IsTeamTarget() bool {
	return c == ScheduleTeamRead || c == ScheduleTeamEdit
}

// Policy は、職員に与える権限である。NeedsTarget が true の権限は、対象の職員かチームを指定して与える。
type Policy struct {
	ID          string
	Code        PolicyCode
	Name        string
	NeedsTarget bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
