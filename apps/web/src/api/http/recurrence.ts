import type { components } from '../generated/schedule'

type Schemas = components['schemas']
/** 予定の API が返す繰り返しの予定。 */
export type ApiRecurringSchedule = Schemas['RecurringSchedule']

const OCCURRENCE_PREFIX = 'recurring-'
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 繰り返しの予定の 1 回を指す ID。予定の詳細と編集の route で、単発の予定の ID と並べて使う。
 * 単発の予定の ID は ULID なので、この形とは重ならない。
 */
export const occurrenceId = (recurringId: string, date: string) =>
  `${OCCURRENCE_PREFIX}${recurringId}-${date}`

/** occurrenceId の ID を、繰り返しの予定の ID と回の日付に分ける。回の ID でなければ undefined を返す。 */
export const parseOccurrenceId = (
  id: string,
): { recurringId: string; date: string } | undefined => {
  const match = /^recurring-(.+)-(\d{4}-\d{2}-\d{2})$/.exec(id)
  return match === null ? undefined : { recurringId: match[1], date: match[2] }
}

const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`)
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10)

/** 月曜を 1、日曜を 7 とする曜日。 */
const isoWeekday = (time: number) => new Date(time).getUTCDay() || 7

/**
 * 繰り返しの予定が date（YYYY-MM-DD）に回を持つかを返す。除外した日は考えない。
 * 規則は予定の API の繰り返しの規則（DesignDoc の繰り返しの予定）と同じにする。
 */
export const occurs = (recurringSchedule: ApiRecurringSchedule, date: string): boolean => {
  const { recurring_rule: rule } = recurringSchedule
  if (date < recurringSchedule.date) return false
  if (rule.end_date != null && date > rule.end_date) return false
  const day = new Date(dayOf(date)).getUTCDate()
  const weekday = rule.day_of_week ?? isoWeekday(dayOf(recurringSchedule.date))
  if (rule.frequency === 'weekly') return isoWeekday(dayOf(date)) === weekday
  if (rule.day_of_month != null) return day === rule.day_of_month
  if (rule.week_of_month != null)
    return (
      isoWeekday(dayOf(date)) === weekday && Math.floor((day - 1) / 7) + 1 === rule.week_of_month
    )
  return day === new Date(dayOf(recurringSchedule.date)).getUTCDate()
}

/** 繰り返しの予定の date の回を、単発の予定の形にする。ID は occurrenceId で作る。 */
export const occurrenceOf = (
  recurringSchedule: ApiRecurringSchedule,
  date: string,
): Schemas['Schedule'] => ({
  id: occurrenceId(recurringSchedule.id, date),
  facility_id: recurringSchedule.facility_id,
  schedule_type_id: recurringSchedule.schedule_type_id,
  schedule_type: recurringSchedule.schedule_type,
  date,
  start_time: recurringSchedule.start_time,
  end_time: recurringSchedule.end_time,
  is_over_time_work: recurringSchedule.is_over_time_work,
  staff_id: recurringSchedule.staff_id,
  staff_name: recurringSchedule.staff_name,
  title: recurringSchedule.title,
  description: recurringSchedule.description,
  recurring_schedule_id: recurringSchedule.id,
  visit_info: recurringSchedule.visit_info,
  cancel: null,
  created_at: recurringSchedule.created_at,
  updated_at: recurringSchedule.updated_at,
})

/**
 * 繰り返しの予定の、from から to まで（両端を含む YYYY-MM-DD）の回を、単発の予定の形で返す。
 * 除外した日（1 回だけ置き換えた日を含む）は返さない。
 */
export const expandRecurring = (
  recurringSchedule: ApiRecurringSchedule,
  from: string,
  to: string,
): Schemas['Schedule'][] => {
  const excluded = new Set(recurringSchedule.exclusion_dates)
  const out: Schemas['Schedule'][] = []
  for (
    let time = dayOf(from > recurringSchedule.date ? from : recurringSchedule.date);
    time <= dayOf(to);
    time += DAY_MS
  ) {
    const date = dateOf(time)
    if (!excluded.has(date) && occurs(recurringSchedule, date))
      out.push(occurrenceOf(recurringSchedule, date))
  }
  return out
}
