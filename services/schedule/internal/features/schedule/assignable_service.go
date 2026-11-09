package schedule

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/visit"
)

// assignment は、予定に既に割り振った職員を役割ごとに持ち、訪問の予定なら既に付けた利用者を持つ。役割に職員がいなければ空である。
type assignment struct {
	staffID         string
	assignedStaffID string
	companionID     string
	patientID       string
}

// assignedOf は、予定の職員 staffID と訪問の情報 v から、予定に割り振った職員と利用者を返す。
func assignedOf(staffID string, v *visit.Info) assignment {
	a := assignment{staffID: staffID}
	if v != nil {
		a.assignedStaffID = v.AssignedStaffID
		a.patientID = v.PatientID
		if v.CompanionID != nil {
			a.companionID = *v.CompanionID
		}
	}
	return a
}

// requireAssignable は、date の予定に職員 st を割り振れるかを確認する。keptID は、同じ役割に既に割り振った職員である。
// 既に割り振った職員は、休職でも割り振ったまま保存できる。退職した職員は、今日 today より前の予定でだけ保存できる。
// 退職した職員に、誰も行かない今日以降の予定を残さないためである（ADR-0004）。
func requireAssignable(st staff.Ref, keptID string, date, today civil.Date) error {
	if keptID != "" && st.ID == keptID && (st.Status != staff.StatusRetired || date.Before(today)) {
		return nil
	}
	return st.RequireAssignable()
}
