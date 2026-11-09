import type { Patient, Schedule, Staff } from '#/api/types'

/** カレンダーに置く 1 件の予定。 */
export type ScheduleCalendarEvent = {
  id: Schedule['id']
  title: string
  staffId: Staff['id']
  start: string
  end: string
  /** 予定の面の色。CSS の色の値で、上に白の文字（text-inverse）を置ける。 */
  color: string
  /** キャンセルした予定。面を薄くし、取り消し線と「キャンセル」の印で出す。 */
  isCancelled: boolean
  /** 確認が必要な Google カレンダーの予定。「要確認」の印を付けて出す。 */
  needsReview: boolean
}

const CATEGORICAL_COLOR_COUNT = 10

/**
 * 職員の並びの位置から、区別の色（categorical-1 から categorical-10）の CSS の変数を返す。
 * 11 人目からは 1 に戻り、色が重なる。
 */
const staffColor = (index: number) =>
  `var(--buddy-color-categorical-${(index % CATEGORICAL_COLOR_COUNT) + 1})`

/** 職員の id から区別の色への表。カレンダーの予定と職員の絞り込みの凡例が、同じ表を使う。 */
export const staffColorMap = (staffList: Staff[]) =>
  new Map(staffList.map((staff, index) => [staff.id, staffColor(index)]))

/** 予定を、カレンダーに置く形にする。訪問の予定は利用者の名前をタイトルにする。 */
export const toCalendarEvents = (
  schedules: Schedule[],
  staffList: Staff[],
  patients: Patient[],
): ScheduleCalendarEvent[] => {
  const colorByStaff = staffColorMap(staffList)
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
    color: colorByStaff.get(schedule.staffId) ?? 'var(--buddy-color-text-secondary)',
    isCancelled: schedule.cancel !== undefined,
    needsReview: schedule.reviewReason !== undefined,
  }))
}
