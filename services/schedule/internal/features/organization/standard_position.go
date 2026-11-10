package organization

// StandardPosition は、事業所を足すときに作る標準の役職と、そのデフォルトの権限である（ADR-0007）。
// 名前は作った後に事業所ごとに変えてよく、判定は役職を使わない。
type StandardPosition struct {
	Name     string
	Policies []PolicyCode
}

// StandardPositions は、標準の 4 つの役職を、マネージャー、チームリーダー、メンバー、事務の順に返す。
// デフォルトの権限は PRD の役職ごとの権限の表のとおりで、先頭のマネージャーだけが職員の管理の権限を持つ。
func StandardPositions() []StandardPosition {
	return []StandardPosition{
		{Name: "マネージャー", Policies: []PolicyCode{ScheduleSelfEdit, ScheduleAllRead, ScheduleAllEdit, StaffManage, ReceiptCheck}},
		{Name: "チームリーダー", Policies: []PolicyCode{ScheduleSelfEdit, ScheduleTeamRead, ScheduleTeamEdit}},
		{Name: "メンバー", Policies: []PolicyCode{ScheduleSelfEdit}},
		{Name: "事務", Policies: []PolicyCode{ScheduleAllRead, ScheduleAllEdit, ReceiptCheck}},
	}
}
