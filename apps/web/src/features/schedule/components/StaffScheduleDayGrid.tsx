import { clsx } from 'clsx'
import { useEffect, useRef, type CSSProperties } from 'react'

import type { Staff } from '#/api/types'

import { addMinutesToTimeKey, formatScheduleTimeRange, toDateKey } from '../lib/dateTime'
import type { ScheduleCalendarEvent } from '../lib/toCalendarEvents'
import { CancelledMark } from './CancelledMark'
import { NeedsReviewMark } from './NeedsReviewMark'

const DAY_MINUTES = 24 * 60
const SCROLL_HOUR = 6
const SLOT_MINUTES = 30
// 30 分の枠を、押せる領域の下限の 44px にする（packages/ui/DESIGN.md）
const HOUR_HEIGHT_PX = 88

const SLOT_TIMES = Array.from({ length: DAY_MINUTES / SLOT_MINUTES }, (_, i) =>
  addMinutesToTimeKey('00:00', i * SLOT_MINUTES),
)

/**
 * 日時の、表示する日（`YYYY-MM-DD`）の枠の上での位置を、0 時からの分で返す。
 * 前の日なら 0、翌日以降なら 24 時間にする。夏時間で経過の分と時計の時刻がずれないよう、時計の時と分で数える。
 */
const minutesInDay = (date: string, value: string | Date) => {
  const local = new Date(value)
  const dateKey = toDateKey(local)
  if (dateKey < date) return 0
  if (dateKey > date) return DAY_MINUTES
  return local.getHours() * 60 + local.getMinutes()
}

export type StaffScheduleDayGridProps = {
  /** 表示する日。`YYYY-MM-DD` */
  date: string
  staffList: Staff[]
  events: ScheduleCalendarEvent[]
  /** 空いた時間の枠を押したときに呼ぶ。 */
  onSlotClick: (staffId: Staff['id'], timeKey: string) => void
  /** 時間の枠を押して予定を作れる職員か。偽の職員の列の枠は押せない。省くと全ての職員の枠を押せる。 */
  canCreateFor?: (staff: Staff) => boolean
  onEventClick: (scheduleId: string) => void
  /** 表示している日が今日のときだけ渡す。その時刻に横線を引く。 */
  now?: Date
}

/**
 * 1 日の予定を、職員ごとの列に並べて出す。0 時から 24 時までを 30 分の枠で区切り、開いたときに 6 時の位置を出す。
 * 前の日に始まる予定と翌日に終わる予定は、表示する日にかかる分だけを描き、表示する日にかからない予定は描かない。
 */
export const StaffScheduleDayGrid = ({
  date,
  staffList,
  events,
  onSlotClick,
  canCreateFor = () => true,
  onEventClick,
  now,
}: StaffScheduleDayGridProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current !== null) scrollRef.current.scrollTop = SCROLL_HOUR * HOUR_HEIGHT_PX
  }, [date])

  const nowMinutes = now === undefined ? undefined : minutesInDay(date, now)
  return (
    <div
      className="h-full snap-x snap-mandatory overflow-auto bg-surface desktop:snap-none"
      data-testid="staff-schedule-day-grid"
      ref={scrollRef}
    >
      <div
        // 幅 768px 未満では、時刻の列を 3rem、職員の列を 9rem 以上にし、幅 390px で 2 人分と 3 人目の一部を見せる
        className="grid min-w-max grid-cols-[3rem_repeat(var(--staff-count),minmax(9rem,1fr))] desktop:grid-cols-[4rem_repeat(var(--staff-count),minmax(10rem,1fr))]"
        style={{ '--staff-count': staffList.length } as CSSProperties}
      >
        <div className="sticky top-0 left-0 z-20 border-b border-border bg-surface" />
        {staffList.map((staff) => (
          <div
            className="sticky top-0 z-10 truncate border-b border-l border-border bg-surface px-2 py-2 text-center text-caption font-bold"
            key={staff.id}
          >
            {staff.name}
          </div>
        ))}

        <div className="sticky left-0 z-10 bg-surface" data-testid="day-grid-times">
          {SLOT_TIMES.filter((time) => time.endsWith(':00')).map((time) => (
            <div
              className="pr-2 text-right text-caption text-text-secondary"
              key={time}
              style={{ height: HOUR_HEIGHT_PX }}
            >
              {time}
            </div>
          ))}
        </div>
        {staffList.map((staff) => (
          <div
            className="relative snap-start scroll-ml-12 border-l border-border desktop:scroll-ml-16"
            data-testid={`day-grid-staff-${staff.id}`}
            key={staff.id}
          >
            {SLOT_TIMES.map((time) =>
              canCreateFor(staff) ? (
                <button
                  aria-label={`${staff.name} ${time} に予定を作成`}
                  className="block w-full border-b border-border hover:bg-surface-subtle focus-visible:focus-ring"
                  data-testid={`day-grid-slot-${staff.id}-${time}`}
                  key={time}
                  onClick={() => onSlotClick(staff.id, time)}
                  style={{ height: (HOUR_HEIGHT_PX * SLOT_MINUTES) / 60 }}
                  type="button"
                />
              ) : (
                <div
                  className="border-b border-border"
                  key={time}
                  style={{ height: (HOUR_HEIGHT_PX * SLOT_MINUTES) / 60 }}
                />
              ),
            )}
            {events
              .filter(
                (event) =>
                  event.staffId === staff.id &&
                  minutesInDay(date, event.end) > minutesInDay(date, event.start),
              )
              // キャンセルした予定を先に描き、重なる生きている予定を上に出す
              .sort((a, b) => Number(b.isCancelled) - Number(a.isCancelled))
              .map((event) => {
                const startMinutes = minutesInDay(date, event.start)
                const top = (startMinutes / 60) * HOUR_HEIGHT_PX
                const height = Math.max(
                  ((minutesInDay(date, event.end) - startMinutes) / 60) * HOUR_HEIGHT_PX,
                  20,
                )
                const start = new Date(event.start)
                const end = new Date(event.end)
                return (
                  <button
                    className={clsx(
                      'absolute overflow-hidden rounded-4 px-1.5 py-0.5 text-left text-caption focus-visible:focus-ring',
                      // キャンセルした予定は面を薄くし、職員の色は左の線にだけ残す。
                      // 同じ時刻に入れ直した予定を隠さず、空いた枠も押せるよう、左の半分にだけ置く
                      event.isCancelled
                        ? 'right-1/2 left-1 border-l-4 bg-surface-subtle text-text-secondary'
                        : 'inset-x-1 text-text-inverse',
                    )}
                    data-testid={`schedule-event-${event.id}`}
                    key={event.id}
                    onClick={() => onEventClick(event.id)}
                    style={
                      event.isCancelled
                        ? { top, height, borderColor: event.color }
                        : { top, height, backgroundColor: event.color }
                    }
                    type="button"
                  >
                    <span className="block truncate">
                      {event.isCancelled && <CancelledMark />}
                      <span
                        className={event.isCancelled ? 'line-through' : undefined}
                        data-testid={
                          event.isCancelled ? `schedule-event-${event.id}-cancelled` : undefined
                        }
                      >
                        {/* 幅 768px 未満では、利用者の名前が切れないよう、時刻とタイトルを 2 行に分ける。
                            「要確認」の印は時刻と同じ行に置き、30 分の予定でも 2 行に収める。
                            印は inline-block にして、キャンセルの取り消し線を印に引かない */}
                        <span className="block desktop:inline">
                          {event.needsReview && (
                            <span className="inline-block">
                              <NeedsReviewMark scheduleId={event.id} />
                            </span>
                          )}
                          {formatScheduleTimeRange(start, end)}
                        </span>{' '}
                        <span className="font-bold">{event.title}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            {nowMinutes !== undefined && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-0.5 bg-primary"
                data-testid={`day-grid-now-${staff.id}`}
                style={{ top: (nowMinutes / 60) * HOUR_HEIGHT_PX - 1 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
