import { getCalendarRange } from './calendarRange'
import { addDaysToDateKey, toDateKey } from './dateTime'
import type { ScheduleCalendarEvent } from './toCalendarEvents'

/** 週の一覧の 1 行。 */
export type WeekAgendaItem = {
  event: ScheduleCalendarEvent
  /** 表示する週より前の日に始まり、週の最初の日に終わる予定。週の最初の日の下の最初に置く。 */
  startsBeforeWeek: boolean
}

/** 週の一覧の 1 日分。予定の無い日も、items を空にして返す。 */
export type WeekAgendaDay = {
  /** `YYYY-MM-DD` */
  dateKey: string
  items: WeekAgendaItem[]
}

/**
 * dateKey を含む週（日曜から 7 日）の予定を、日ごとに開始の時刻の順に並べる。同じ時刻なら staffOrder の順にする。
 * 予定は開始の日の下にだけ置く。週より前に始まる予定は、週の最初の日の下の最初に置く。週の後に始まる予定は置かない。
 */
export const groupWeekAgenda = (
  dateKey: string,
  events: ScheduleCalendarEvent[],
  staffOrder: string[],
): WeekAgendaDay[] => {
  const firstDay = getCalendarRange('week', dateKey).from.slice(0, 10)
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDateKey(firstDay, i))
  const staffIndex = (staffId: string) => {
    const index = staffOrder.indexOf(staffId)
    return index === -1 ? staffOrder.length : index
  }
  const sorted = [...events].sort(
    (a, b) =>
      Date.parse(a.start) - Date.parse(b.start) || staffIndex(a.staffId) - staffIndex(b.staffId),
  )
  return days.map((day) => ({
    dateKey: day,
    items: sorted.flatMap((event): WeekAgendaItem[] => {
      const startDay = toDateKey(new Date(event.start))
      if (startDay === day) return [{ event, startsBeforeWeek: false }]
      if (day === firstDay && startDay < firstDay) return [{ event, startsBeforeWeek: true }]
      return []
    }),
  }))
}
