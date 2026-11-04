import jaLocale from '@fullcalendar/core/locales/ja'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { useEffect, useRef, useState } from 'react'

import { useIsDesktop } from '@buddy/ui'

import type { CalendarView } from '../constants/calendarView'
import { nextDayPrefix, toDateKey, toTimeKey, WEEKDAYS } from '../lib/dateTime'
import type { ScheduleCalendarEvent } from '../lib/toCalendarEvents'
import { CancelledMark } from './CancelledMark'
import { NeedsReviewMark } from './NeedsReviewMark'

const FULL_CALENDAR_VIEW = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
} as const satisfies Partial<Record<CalendarView, string>>

/**
 * 週の表示の列の見出しを「11/1(日)」の 1 行で出す、カレンダーの枠の幅の下限。
 * 最も長い「12/31(水)」が 84px、時間の目盛りが 46px なので、7 列と時間の目盛りで 634px になる。これに余裕を足した。
 */
const WIDE_DAY_HEADER_MIN_WIDTH_PX = 680

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
  const isDesktop = useIsDesktop()
  // 枠の幅を測れない間（jsdom と描く前）は、枠の幅では 2 行に切り替えない
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  // 幅 768px 以上でも、左の欄を開くとカレンダーの枠が狭くなり、1 行の見出しが列に入り切らないので、枠の幅でも判定する
  const twoLineDayHeader =
    !isDesktop || (containerWidth !== null && containerWidth < WIDE_DAY_HEADER_MIN_WIDTH_PX)

  // FullCalendar は画面の幅の変化でしか描き直さないので、サイドバーの開閉で枠の幅が変わったときにも描き直させる
  useEffect(() => {
    const container = containerRef.current
    if (container === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setContainerWidth(entry.contentRect.width)
      calendarRef.current?.getApi().updateSize()
    })
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
        dayHeaderContent={(arg) =>
          // 月の表示の見出しは曜日だけなので、狭い幅でも FullCalendar の書式のままにする
          arg.view.type === FULL_CALENDAR_VIEW.week && twoLineDayHeader ? (
            <span className="flex flex-col items-center">
              <span>{WEEKDAYS[arg.dow]}</span>
              <span>{arg.date.getDate()}</span>
            </span>
          ) : (
            // 文字列を返すと、FullCalendar は React で描いた 2 行の見出しを残したまま描き直さないので、要素で返す
            <span>{arg.text}</span>
          )
        }
        eventDisplay="block"
        eventClick={(arg) => onEventClick(arg.event.id)}
        eventContent={(arg) => {
          const isCancelled = arg.event.extendedProps.isCancelled === true
          return (
            <span
              className="block truncate px-1 text-caption"
              data-testid={`schedule-event-${arg.event.id}`}
            >
              {isCancelled && <CancelledMark />}
              {arg.event.extendedProps.needsReview === true && (
                <NeedsReviewMark scheduleId={arg.event.id} />
              )}
              <span
                className={isCancelled ? 'line-through' : undefined}
                data-testid={isCancelled ? `schedule-event-${arg.event.id}-cancelled` : undefined}
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
          backgroundColor: event.isCancelled ? 'var(--buddy-color-surface-subtle)' : event.color,
          borderColor: event.color,
          textColor: event.isCancelled
            ? 'var(--buddy-color-text-secondary)'
            : 'var(--buddy-color-text-inverse)',
          extendedProps: { isCancelled: event.isCancelled, needsReview: event.needsReview },
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
