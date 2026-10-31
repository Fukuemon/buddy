import { clsx } from 'clsx'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import PrevIcon from '#/assets/icons/arrow-left.svg?react'
import NextIcon from '#/assets/icons/arrow-right.svg?react'

import type { CalendarView } from '../constants/calendarView'
import { getCalendarRange } from '../lib/calendarRange'
import { fromDateKey, toDateKey } from '../lib/dateTime'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

const toMonthKey = (dateKey: string) => `${dateKey.slice(0, 7)}-01`

/** 月の 1 日を含む週の日曜から、6 週分の `YYYY-MM-DD` を返す。 */
const monthGridDays = (monthKey: string) => {
  const first = fromDateKey(monthKey)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) =>
    toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)),
  )
}

const shiftDays = (dateKey: string, days: number) => {
  const date = fromDateKey(dateKey)
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/** 矢印のキーで動かす日数。 */
const KEY_DAYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

const shiftMonth = (monthKey: string, direction: 1 | -1) => {
  const date = fromDateKey(monthKey)
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + direction, 1))
}

const formatDay = (dateKey: string) => {
  const date = fromDateKey(dateKey)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export type ScheduleMiniCalendarProps = {
  view: CalendarView
  /** カレンダーが表示している基準の日。`YYYY-MM-DD` */
  date: string
  /** 今日。`YYYY-MM-DD` */
  today: string
  /** 日を押したときに、その日の `YYYY-MM-DD` を渡す。 */
  onSelect: (dateKey: string) => void
}

/**
 * 日付を選んでカレンダーの表示を移す、月のミニカレンダー。
 * 日と週の表示では、カレンダーが出している期間の日に面の色を付ける。今日は丸の印で示す。
 * 前後のボタンはミニカレンダーの月だけを動かす。カレンダーの基準の日が変わると、その日の月に戻す。
 * 日の表は Tab で 1 度だけ止まり、矢印のキーで日を動かす。表の外の日へ動くと、その日の月を出す。
 */
export const ScheduleMiniCalendar = ({
  view,
  date,
  today,
  onSelect,
}: ScheduleMiniCalendarProps) => {
  const [shownMonth, setShownMonth] = useState(() => toMonthKey(date))
  const [focusedDay, setFocusedDay] = useState(date)
  const [syncedDate, setSyncedDate] = useState(date)
  if (syncedDate !== date) {
    setSyncedDate(date)
    setShownMonth(toMonthKey(date))
    setFocusedDay(date)
  }
  const tableRef = useRef<HTMLTableElement>(null)
  // 矢印のキーで動かした後の描画で、Tab の止まる日にフォーカスを移す
  const shouldFocusRef = useRef(false)
  useEffect(() => {
    if (!shouldFocusRef.current) return
    shouldFocusRef.current = false
    tableRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
  })

  const range = getCalendarRange(view, date)
  const inRange = (dateKey: string) =>
    view !== 'month' && dateKey >= range.from.slice(0, 10) && dateKey < range.to.slice(0, 10)
  const days = monthGridDays(shownMonth)
  const weeks = Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7))
  const monthDate = fromDateKey(shownMonth)
  // 動かした日が表に無いとき（前後のボタンで月を変えた後）は、月の 1 日で止まる
  const tabbableDay = days.includes(focusedDay) ? focusedDay : shownMonth

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, dateKey: string) => {
    const offset = KEY_DAYS[event.key]
    if (offset === undefined) return
    event.preventDefault()
    const next = shiftDays(dateKey, offset)
    if (!monthGridDays(shownMonth).includes(next)) setShownMonth(toMonthKey(next))
    setFocusedDay(next)
    shouldFocusRef.current = true
  }

  return (
    <section aria-label="日付を選ぶ" className="flex flex-col gap-2" data-testid="mini-calendar">
      <div className="flex items-center justify-between">
        <h2
          aria-live="polite"
          className="pl-2 text-body-dense font-bold"
          data-testid="mini-calendar-month"
        >
          {`${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月`}
        </h2>
        <div className="flex">
          <button
            aria-label="前の月"
            className="grid size-11 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
            data-testid="mini-calendar-prev"
            onClick={() => setShownMonth(shiftMonth(shownMonth, -1))}
            type="button"
          >
            <PrevIcon height={20} width={20} />
          </button>
          <button
            aria-label="次の月"
            className="grid size-11 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
            data-testid="mini-calendar-next"
            onClick={() => setShownMonth(shiftMonth(shownMonth, 1))}
            type="button"
          >
            <NextIcon height={20} width={20} />
          </button>
        </div>
      </div>
      <table ref={tableRef} className="w-full table-fixed border-collapse text-center">
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th
                className="h-8 text-caption font-normal text-text-secondary"
                key={weekday}
                scope="col"
              >
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((dateKey) => {
                const isToday = dateKey === today
                const isShown = inRange(dateKey)
                const isOtherMonth = dateKey.slice(0, 7) !== shownMonth.slice(0, 7)
                return (
                  <td className={clsx('p-0', isShown && 'bg-primary-surface')} key={dateKey}>
                    <button
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={isShown ? `${formatDay(dateKey)}（表示中）` : formatDay(dateKey)}
                      className="group grid h-11 w-full place-items-center rounded-8 focus-visible:focus-ring"
                      data-testid={`mini-calendar-day-${dateKey}`}
                      onClick={() => {
                        setFocusedDay(dateKey)
                        onSelect(dateKey)
                      }}
                      onKeyDown={(event) => moveFocus(event, dateKey)}
                      tabIndex={dateKey === tabbableDay ? 0 : -1}
                      type="button"
                    >
                      <span
                        className={clsx(
                          'grid size-8 place-items-center rounded-full text-body-dense group-hover:underline',
                          isToday
                            ? 'bg-primary font-bold text-text-inverse'
                            : isOtherMonth
                              ? 'text-text-secondary'
                              : 'text-text',
                        )}
                      >
                        {fromDateKey(dateKey).getDate()}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
