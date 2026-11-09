import { clsx } from 'clsx'

import type { Staff } from '#/api/types'
import { formatDateKey } from '#/components/dateFormat'

import { formatScheduleTimeRange } from '../lib/dateTime'
import type { ScheduleCalendarEvent } from '../lib/toCalendarEvents'
import { groupWeekAgenda, type WeekAgendaItem } from '../lib/weekAgenda'
import { CancelledMark } from './CancelledMark'
import { NeedsReviewMark } from './NeedsReviewMark'

/**
 * 行の時刻の文。`09:00〜09:30` の形にし、翌日に終わる予定は `22:00〜翌 01:00` にする。
 * 週より前の日に始まる予定は、週の最初の日の下に置くので `前日 22:00〜01:00` にする。
 */
const timeText = ({ event, startsBeforeWeek }: WeekAgendaItem) =>
  formatScheduleTimeRange(new Date(event.start), new Date(event.end), startsBeforeWeek)

/** 日の見出し。週の一覧の上に年が出るので、年を省く。 */
const dayHeading = (dateKey: string) => formatDateKey(dateKey, { withYear: false })

export type ScheduleWeekAgendaProps = {
  /** 表示の基準の日付。この日を含む週（日曜から 7 日）を出す。`YYYY-MM-DD` */
  date: string
  /** 今日。`YYYY-MM-DD`。この日の見出しの色を変える */
  today: string
  events: ScheduleCalendarEvent[]
  /** 職員の名前と、同じ時刻の予定を並べる順に使う。 */
  staffList: Staff[]
  onDayClick: (dateKey: string) => void
  onEventClick: (scheduleId: string) => void
}

/**
 * 幅 768px 未満の週の表示。時刻の格子の代わりに、1 週間の予定を日ごとに時刻の順に縦に並べる。
 * 日の見出しを押すとその日を、行を押すと予定を渡す。予定の無い日も見出しだけを出す。
 */
export const ScheduleWeekAgenda = ({
  date,
  today,
  events,
  staffList,
  onDayClick,
  onEventClick,
}: ScheduleWeekAgendaProps) => {
  const staffName = new Map(staffList.map((staff) => [staff.id, staff.name]))
  const days = groupWeekAgenda(
    date,
    events,
    staffList.map((staff) => staff.id),
  )
  return (
    <div className="h-full overflow-y-auto bg-surface" data-testid="schedule-agenda">
      {days.map(({ dateKey, items }) => (
        <section aria-label={dayHeading(dateKey)} key={dateKey}>
          <h2>
            <button
              className={clsx(
                'flex min-h-11 w-full items-center border-b border-border px-2 text-left text-caption font-bold focus-visible:focus-ring',
                dateKey === today && 'text-primary',
              )}
              data-testid={`schedule-agenda-day-${dateKey}`}
              onClick={() => onDayClick(dateKey)}
              type="button"
            >
              {dayHeading(dateKey)}
            </button>
          </h2>
          {items.map((item) => {
            const { event } = item
            return (
              <button
                className={clsx(
                  'grid min-h-11 w-full grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 border-b border-border px-2 py-1 text-left focus-visible:focus-ring',
                  event.isCancelled && 'text-text-secondary',
                )}
                data-testid={`schedule-event-${event.id}`}
                key={event.id}
                onClick={() => onEventClick(event.id)}
                type="button"
              >
                <span className="text-caption text-text-secondary tabular-nums">
                  {event.isCancelled && <CancelledMark />}
                  {event.needsReview && <NeedsReviewMark scheduleId={event.id} />}
                  {timeText(item)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={clsx('truncate', event.isCancelled && 'line-through')}
                    data-testid={
                      event.isCancelled ? `schedule-event-${event.id}-cancelled` : undefined
                    }
                  >
                    {event.title}
                  </span>
                  <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: event.color }}
                    />
                    {staffName.get(event.staffId)}
                  </span>
                </span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
