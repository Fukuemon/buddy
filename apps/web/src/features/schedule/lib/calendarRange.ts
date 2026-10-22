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

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/**
 * ツールバーの見出しに出す、表示の期間の文を返す。
 * 月は `2026年10月`、週は日曜から土曜を `2026年10月18日〜24日`、日は `2026年10月20日（火）` の形にする。
 * 週が月や年をまたぐときは、終わりの日にも月か年を付ける。
 */
export const formatCalendarTitle = (view: CalendarView, dateKey: string) => {
  const date = fromDateKey(dateKey)
  const ymd = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  switch (view) {
    case 'month':
      return `${date.getFullYear()}年${date.getMonth() + 1}月`
    case 'day':
      return `${ymd(date)}（${WEEKDAYS[date.getDay()]}）`
    case 'week': {
      const start = addDays(date, -date.getDay())
      const end = addDays(start, 6)
      if (start.getFullYear() !== end.getFullYear()) return `${ymd(start)}〜${ymd(end)}`
      if (start.getMonth() !== end.getMonth())
        return `${ymd(start)}〜${end.getMonth() + 1}月${end.getDate()}日`
      return `${ymd(start)}〜${end.getDate()}日`
    }
  }
}
