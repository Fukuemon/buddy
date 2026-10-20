import type { Patient, Schedule, Staff } from '#/api/types'

/** カレンダーに置く 1 件の予定。 */
export type ScheduleCalendarEvent = {
  id: Schedule['id']
  title: string
  staffId: Staff['id']
  start: string
  end: string
  color: string
}

/** 職員の並びの位置から、色相を等分した色を返す。 */
export const staffColor = (index: number, total: number) =>
  `hsl(${Math.round((index * 360) / Math.max(total, 1))} 65% 45%)`

/** 予定を、カレンダーに置く形にする。訪問の予定は利用者の名前を題にする。 */
export const toCalendarEvents = (
  schedules: Schedule[],
  staffList: Staff[],
  patients: Patient[],
): ScheduleCalendarEvent[] => {
  const colorByStaff = new Map(
    staffList.map((staff, index) => [staff.id, staffColor(index, staffList.length)]),
  )
  const patientName = new Map(patients.map((patient) => [patient.id, patient.name]))

  return schedules.map((schedule) => ({
    id: schedule.id,
    title:
      schedule.kind === 'visit' && schedule.visit !== undefined
        ? `${patientName.get(schedule.visit.patientId) ?? '利用者不明'} 訪問`
        : schedule.title,
    staffId: schedule.staffId,
    start: schedule.startsAt,
    end: schedule.endsAt,
    color: colorByStaff.get(schedule.staffId) ?? 'var(--color-gray-500)',
  }))
}
