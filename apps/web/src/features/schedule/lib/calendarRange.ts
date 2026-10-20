import type { CalendarView } from '../constants/calendarView'
import { fromDateKey, toDateKey, toOffsetDateTime } from './dateTime'

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

/** 表示の種類に合わせて、基準の日付を 1 単位（日、週、月）前後に動かす。 */
export const shiftCalendarDate = (view: CalendarView, dateKey: string, direction: 1 | -1) => {
  const date = fromDateKey(dateKey)
  switch (view) {
    case 'day':
      return toDateKey(addDays(date, direction))
    case 'week':
      return toDateKey(addDays(date, 7 * direction))
    case 'month':
      return toDateKey(new Date(date.getFullYear(), date.getMonth() + direction, 1))
  }
}

/**
 * 表示の種類と基準の日付から、予定を取る期間を返す。週は日曜に始まる。
 * 月の表示は、前後の月の日も並ぶため、月の初日を含む週の日曜から 6 週分を返す。
 */
export const getCalendarRange = (view: CalendarView, dateKey: string) => {
  const date = fromDateKey(dateKey)
  const startOfWeek = (d: Date) => addDays(d, -d.getDay())
  const [from, to] = (() => {
    switch (view) {
      case 'day':
        return [date, addDays(date, 1)]
      case 'week': {
        const start = startOfWeek(date)
        return [start, addDays(start, 7)]
      }
      case 'month': {
        const start = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1))
        return [start, addDays(start, 42)]
      }
    }
  })()
  return { from: toOffsetDateTime(from), to: toOffsetDateTime(to) }
}
