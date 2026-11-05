import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import jaLocale from '@fullcalendar/react/locales/ja'
import classicTheme from '@fullcalendar/react/themes/classic'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import { clsx } from 'clsx'
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
 * 週の表示の予定に出す時刻の文を、`9:00 - 9:30` の形で返す。翌日に終わる予定は、開始の日と翌日の両方に予定の全体の時刻を `22:00 - 翌 1:00` の形で出す。
 * FullCalendar 7 の日本語の時刻の文は `9時00分～9時30分` の形で、区切りを変えるオプションが無いので、ここで作る。
 */
const eventTimeText = (start: Date | null, end: Date | null, timeText: string) =>
  start === null || end === null
    ? timeText
    : `${hourMinute(start)} - ${nextDayPrefix(start, end)}${hourMinute(end)}`

/** 時刻の見出しの `data-time` に入れる `HH:mm:ss`。E2E の spec が時刻の見出しを指すのに使う。 */
const slotTime = (milliseconds: number) => {
  const minutes = Math.floor(milliseconds / 60000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`
}

export type ScheduleCalendarProps = {
  view: keyof typeof FULL_CALENDAR_VIEW
  /** 表示の基準の日付。`YYYY-MM-DD` */
  date: string
  events: ScheduleCalendarEvent[]
  /** 空いた日や時間を押したときに呼ぶ。月の表示では timeKey がない。 */
  onDateClick: (dateKey: string, timeKey?: string) => void
  onEventClick: (scheduleId: string) => void
}

/**
 * 月と週の表示の予定のカレンダー。日の表示は StaffScheduleDayGrid が受け持つ。
 * FullCalendar 7 の DOM は `fc-` のクラスを持たないので、`schedule-calendar-` のクラスを各部に付け、見た目の上書きと E2E の spec が指す。
 */
export const ScheduleCalendar = ({
  view,
  date,
  events,
  onDateClick,
  onEventClick,
}: ScheduleCalendarProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDesktop = useIsDesktop()
  // 枠の幅を測れない間（jsdom と描く前）は、枠の幅では 2 行に切り替えない
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  // 幅 768px 以上でも、左の欄を開くとカレンダーの枠が狭くなり、1 行の見出しが列に入り切らないので、枠の幅でも判定する
  const twoLineDayHeader =
    !isDesktop || (containerWidth !== null && containerWidth < WIDE_DAY_HEADER_MIN_WIDTH_PX)

  // FullCalendar 7 は枠の大きさの変化を自分で追うので、ここでは見出しの行数を決める枠の幅だけを測る
  useEffect(() => {
    const container = containerRef.current
    if (container === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setContainerWidth(entry.contentRect.width)
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
        allDaySlot={false}
        dateClick={(arg) =>
          onDateClick(toDateKey(arg.date), arg.allDay ? undefined : toTimeKey(arg.date))
        }
        dayCellClass="schedule-calendar-day"
        dayCellTopClass="schedule-calendar-day-top"
        dayCellTopContent={(arg) => arg.dayNumberText.replace('日', '')}
        dayCellTopInnerClass="schedule-calendar-day-number"
        dayHeaderClass="schedule-calendar-day-header"
        dayHeaderInnerClass="schedule-calendar-day-header-inner"
        dayHeaderContent={(arg) =>
          // 月の表示の見出しは曜日だけなので、狭い幅でも FullCalendar の書式のままにする
          arg.view.type === FULL_CALENDAR_VIEW.week && twoLineDayHeader ? (
            <span className="flex flex-col items-center" data-testid="schedule-calendar-day-header">
              <span>{WEEKDAYS[arg.dow]}</span>
              <span>{arg.date.getDate()}</span>
            </span>
          ) : (
            // 文字列を返すと、FullCalendar は React で描いた 2 行の見出しを残したまま描き直さないので、要素で返す
            <span data-testid="schedule-calendar-day-header">{arg.text}</span>
          )
        }
        dayLaneClass="schedule-calendar-week-column"
        eventClass="schedule-calendar-event"
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
          // FullCalendar 7 の予定は枠と背景に同じ色を使うので、キャンセルした予定は職員の色を枠に残し、背景を CSS で薄い色にする
          color: event.color,
          className: event.isCancelled ? 'schedule-calendar-event-cancelled' : undefined,
          contrastColor: event.isCancelled
            ? 'var(--buddy-color-text-secondary)'
            : 'var(--buddy-color-text-inverse)',
          extendedProps: {
            isCancelled: event.isCancelled,
            needsReview: event.needsReview,
          },
        }))}
        headerToolbar={false}
        height="100%"
        initialDate={date}
        initialView={FULL_CALENDAR_VIEW[view]}
        key={`${view}-${date}`}
        locale={jaLocale}
        nowIndicator
        plugins={[classicTheme, dayGridPlugin, timeGridPlugin, interactionPlugin]}
        scrollTime="06:00:00"
        slotHeaderClass="schedule-calendar-time-label"
        slotHeaderInnerClass="schedule-calendar-time-label-inner"
        slotHeaderContent={(arg) => (
          <span
            // FullCalendar 7 は時刻の見出しの高さから 30 分の枠の高さを決めるので、押せる領域の下限の 44px をここで持たせる（packages/ui/DESIGN.md）。5px は、見出しの内側の上下の余白の 4px と枠の線の 1px である
            className="schedule-calendar-time-label-text block min-h-[calc(--spacing(11)-5px)]"
            data-time={arg.time === undefined ? undefined : slotTime(arg.time.milliseconds)}
          >
            {arg.text}
          </span>
        )}
        slotLaneClass="schedule-calendar-slot"
        slotMaxTime="24:00:00"
        slotMinTime="00:00:00"
        tableHeaderClass={(arg) => clsx(arg.isSticky && 'shadow-1')}
        // FullCalendar 7 の日本語の週の見出しのデフォルトは「18日(日)」なので、FullCalendar 6 と同じ「10/18(日)」にそろえる
        views={{
          [FULL_CALENDAR_VIEW.week]: {
            dayHeaderFormat: { month: 'numeric', day: 'numeric', weekday: 'short' },
          },
        }}
      />
    </div>
  )
}
