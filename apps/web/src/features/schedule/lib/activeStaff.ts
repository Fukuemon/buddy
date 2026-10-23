import type { Schedule, Staff } from '#/api/types'

/** 予定のカレンダーの職員の列と絞り込み、予定のフォームの職員の候補に出す職員。休職と退職の職員を除き、並びは変えない。 */
export const activeStaff = (staffList: Staff[]) =>
  staffList.filter((staff) => staff.status === undefined)

/** 休職と退職の職員の予定を除く。予定のカレンダーは、休職と退職の職員の予定を出さない。 */
export const excludeInactiveStaffSchedules = (schedules: Schedule[], staffList: Staff[]) => {
  const inactive = new Set(
    staffList.filter((staff) => staff.status !== undefined).map((staff) => staff.id),
  )
  return schedules.filter((schedule) => !inactive.has(schedule.staffId))
}

/**
 * URL の staff から、休職と退職の職員の ID を除く。休職か退職にする前に作ったブックマークに、その職員の ID が残るためである。
 * 職員の一覧を取り終える前は、staffIds をそのまま返す。
 */
export const activeStaffIds = (staffIds: Staff['id'][], staffList: Staff[] | undefined) => {
  if (staffList === undefined) return staffIds
  const active = new Set(activeStaff(staffList).map((staff) => staff.id))
  return staffIds.filter((id) => active.has(id))
}

/**
 * 予定の作成の URL の staffId が、休職か退職の職員を指すときは undefined を返す。
 * 休職か退職にする前に、予定のカレンダーの職員の列から開いた URL が残るためである。職員の一覧を取り終える前は、staffId をそのまま返す。
 */
export const activeStaffId = (staffId: Staff['id'] | undefined, staffList: Staff[] | undefined) => {
  const inactive = staffList?.some((staff) => staff.id === staffId && staff.status !== undefined)
  return inactive === true ? undefined : staffId
}
