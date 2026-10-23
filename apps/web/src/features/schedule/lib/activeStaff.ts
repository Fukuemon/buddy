import type { Schedule, Staff } from '#/api/types'

/** 予定のカレンダーの職員の列と絞り込みに出す職員。止めた職員を除き、並びは変えない。 */
export const activeStaff = (staffList: Staff[]) =>
  staffList.filter((staff) => staff.suspendedAt === undefined)

/** 止めた職員の予定を除く。予定のカレンダーは、止めた職員の予定を出さない。 */
export const excludeSuspendedStaffSchedules = (schedules: Schedule[], staffList: Staff[]) => {
  const suspended = new Set(
    staffList.filter((staff) => staff.suspendedAt !== undefined).map((staff) => staff.id),
  )
  return schedules.filter((schedule) => !suspended.has(schedule.staffId))
}
