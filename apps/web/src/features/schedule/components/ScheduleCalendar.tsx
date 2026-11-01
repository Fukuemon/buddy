import jaLocale from '@fullcalendar/core/locales/ja'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { useEffect, useRef } from 'react'

import type { CalendarView } from '../constants/calendarView'
import { nextDayPrefix, toDateKey, toTimeKey } from '../lib/dateTime'
import type { ScheduleCalendarEvent } from '../lib/toCalendarEvents'
import { CancelledMark } from './CancelledMark'

const FULL_CALENDAR_VIEW = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
} as const satisfies Partial<Record<CalendarView, string>>

const hourMinute = (date: Date) =>
  `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`

/**
 * 予定に出す時刻の文を返す。翌日に終わる予定は、開始の日と翌日の両方に予定の全体の時刻を `22:00 - 翌 1:00` の形で出す。
 * ほかの予定は、FullCalendar が作る `9:00 - 9:30` の形の文をそのまま使う。
 */
const eventTimeText = (start: Date | null, end: Date | null, timeText: string) =>
  start === null || end === null || nextDayPrefix(start, end) === ''
    ? timeText
    : `${hourMinute(start)} - ${nextDayPrefix(start, end)}${hourMinute(end)}`

export type ScheduleCalendarProps = {
  view: keyof typeof FULL_CALENDAR_VIEW
  /** 表示の基準の日付。`YYYY-MM-DD` */
  date: string
  events: ScheduleCalendarEvent[]
  /** 空いた日や時間を押したときに呼ぶ。月の表示では timeKey がない。 */
  onDateClick: (dateKey: string, timeKey?: string) => void
  onEventClick: (scheduleId: string) => void
}

/** 月と週の表示の予定のカレンダー。日の表示は StaffScheduleDayGrid が受け持つ。 */
export const ScheduleCalendar = ({
  view,
  date,
  events,
  onDateClick,
  onEventClick,
}: ScheduleCalendarProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<FullCalendar>(null)

  // FullCalendar は画面の幅の変化でしか描き直さないので、サイドバーの開閉で枠の幅が変わったときにも描き直させる
  useEffect(() => {
    const container = containerRef.current
    if (container === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => calendarRef.current?.getApi().updateSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="schedule-calendar h-full bg-surface"
      data-testid="schedule-calendar"
      ref={containerRef}
    >
      <FullCalendar
        ref={calendarRef}
        allDaySlot={false}
        dateClick={(arg) =>
          onDateClick(toDateKey(arg.date), arg.allDay ? undefined : toTimeKey(arg.date))
        }
        dayCellContent={(arg) => arg.dayNumberText.replace('日', '')}
        eventDisplay="block"
        eventClick={(arg) => onEventClick(arg.event.id)}
        eventContent={(arg) => {
          const cancelled = arg.event.extendedProps.cancelled === true
          return (
            <span
              className="block truncate px-1 text-caption"
              data-testid={`schedule-event-${arg.event.id}`}
            >
              {cancelled && <CancelledMark />}
              <span
                className={cancelled ? 'line-through' : undefined}
                data-testid={cancelled ? `schedule-event-${arg.event.id}-cancelled` : undefined}
              >
                {arg.view.type === FULL_CALENDAR_VIEW.week
                  ? eventTimeText(arg.event.start, arg.event.end, arg.timeText)
                  : arg.timeText}{' '}
                {arg.event.title}
              </span>
            </span>
          )
        }}
        events={events.map((event) => ({
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          backgroundColor: event.cancelled ? 'var(--buddy-color-surface-subtle)' : event.color,
          borderColor: event.color,
          textColor: event.cancelled
            ? 'var(--buddy-color-text-secondary)'
            : 'var(--buddy-color-text-inverse)',
          extendedProps: { cancelled: event.cancelled },
        }))}
        headerToolbar={false}
        height="100%"
        initialDate={date}
        initialView={FULL_CALENDAR_VIEW[view]}
        key={`${view}-${date}`}
        locale={jaLocale}
        nowIndicator
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        scrollTime="06:00:00"
        slotMaxTime="24:00:00"
        slotMinTime="00:00:00"
      />
    </div>
  )
}
