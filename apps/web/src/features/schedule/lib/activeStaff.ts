import type { Schedule, Staff } from '#/api/types'

/** 予定のカレンダーの職員の列と絞り込み、予定のフォームの職員の候補に出す職員。止めた職員を除き、並びは変えない。 */
export const activeStaff = (staffList: Staff[]) =>
  staffList.filter((staff) => staff.suspendedAt === undefined)

/** 止めた職員の予定を除く。予定のカレンダーは、止めた職員の予定を出さない。 */
export const excludeSuspendedStaffSchedules = (schedules: Schedule[], staffList: Staff[]) => {
  const suspended = new Set(
    staffList.filter((staff) => staff.suspendedAt !== undefined).map((staff) => staff.id),
  )
  return schedules.filter((schedule) => !suspended.has(schedule.staffId))
}

/**
 * URL の staff から、止めた職員の ID を除く。止める前に作ったブックマークに、止めた職員の ID が残るためである。
 * 職員の一覧を取り終える前は、staffIds をそのまま返す。
 */
export const activeStaffIds = (staffIds: Staff['id'][], staffList: Staff[] | undefined) => {
  if (staffList === undefined) return staffIds
  const active = new Set(activeStaff(staffList).map((staff) => staff.id))
  return staffIds.filter((id) => active.has(id))
}
