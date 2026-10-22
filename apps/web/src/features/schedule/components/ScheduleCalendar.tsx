import jaLocale from '@fullcalendar/core/locales/ja'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'

import type { CalendarView } from '../constants/calendarView'
import { toDateKey, toTimeKey } from '../lib/dateTime'
import type { ScheduleCalendarEvent } from '../lib/toCalendarEvents'
import { CancelledMark } from './CancelledMark'

const FULL_CALENDAR_VIEW = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
} as const satisfies Partial<Record<CalendarView, string>>

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
}: ScheduleCalendarProps) => (
  <div className="schedule-calendar h-full bg-surface" data-testid="schedule-calendar">
    <FullCalendar
      allDaySlot={false}
      dateClick={(arg) =>
        onDateClick(toDateKey(arg.date), arg.allDay ? undefined : toTimeKey(arg.date))
      }
      dayCellContent={(arg) => arg.dayNumberText.replace('日', '')}
      eventDisplay="block"
      eventClick={(arg) => onEventClick(arg.event.id)}
      eventContent={(arg) => (
        <span className="truncate px-1 text-caption" data-testid={`schedule-event-${arg.event.id}`}>
          {arg.event.extendedProps.cancelled === true && <CancelledMark />}
          <span
            className={arg.event.extendedProps.cancelled === true ? 'line-through' : undefined}
            data-testid={
              arg.event.extendedProps.cancelled === true
                ? `schedule-event-${arg.event.id}-cancelled`
                : undefined
            }
          >
            {arg.timeText} {arg.event.title}
          </span>
        </span>
      )}
      events={events.map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        // キャンセルした予定は面を薄くし、職員の色は枠にだけ残す
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
      slotMaxTime="22:00:00"
      slotMinTime="06:00:00"
    />
  </div>
)
