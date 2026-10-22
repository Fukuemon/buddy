import type { Staff } from '#/api/types'

import { addMinutesToTimeKey, toTimeKey } from '../lib/dateTime'
import type { ScheduleCalendarEvent } from '../lib/toCalendarEvents'

const START_HOUR = 6
const END_HOUR = 22
const SLOT_MINUTES = 30
// 30 分の枠を、押せる領域の下限の 44px にする（packages/ui/DESIGN.md）
const HOUR_HEIGHT_PX = 88

const SLOT_TIMES = Array.from({ length: ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES }, (_, i) =>
  addMinutesToTimeKey(`${String(START_HOUR).padStart(2, '0')}:00`, i * SLOT_MINUTES),
)

const minutesFromStart = (iso: string) => {
  const date = new Date(iso)
  return (date.getHours() - START_HOUR) * 60 + date.getMinutes()
}

export type StaffScheduleDayGridProps = {
  staffList: Staff[]
  events: ScheduleCalendarEvent[]
  /** 空いた時間の枠を押したときに呼ぶ。 */
  onSlotClick: (staffId: Staff['id'], timeKey: string) => void
  onEventClick: (scheduleId: string) => void
}

/** 1 日の予定を、職員ごとの列に並べて出す。6 時から 22 時までを 30 分の枠で区切る。 */
export const StaffScheduleDayGrid = ({
  staffList,
  events,
  onSlotClick,
  onEventClick,
}: StaffScheduleDayGridProps) => (
  <div className="h-full overflow-auto bg-surface" data-testid="staff-schedule-day-grid">
    <div
      className="grid min-w-max"
      style={{ gridTemplateColumns: `4rem repeat(${staffList.length}, minmax(10rem, 1fr))` }}
    >
      <div className="sticky top-0 z-10 border-b border-border bg-surface" />
      {staffList.map((staff) => (
        <div
          className="sticky top-0 z-10 truncate border-b border-l border-border bg-surface px-2 py-2 text-center text-caption font-bold"
          key={staff.id}
        >
          {staff.name}
        </div>
      ))}

      <div className="relative">
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
          className="relative border-l border-border"
          data-testid={`day-grid-staff-${staff.id}`}
          key={staff.id}
        >
          {SLOT_TIMES.map((time) => (
            <button
              aria-label={`${staff.name} ${time} に予定を作成`}
              className="block w-full border-b border-border hover:bg-surface-subtle focus-visible:focus-ring"
              data-testid={`day-grid-slot-${staff.id}-${time}`}
              key={time}
              onClick={() => onSlotClick(staff.id, time)}
              style={{ height: (HOUR_HEIGHT_PX * SLOT_MINUTES) / 60 }}
              type="button"
            />
          ))}
          {events
            .filter((event) => event.staffId === staff.id)
            .map((event) => {
              const top = (minutesFromStart(event.start) / 60) * HOUR_HEIGHT_PX
              const height = Math.max(
                ((minutesFromStart(event.end) - minutesFromStart(event.start)) / 60) *
                  HOUR_HEIGHT_PX,
                20,
              )
              return (
                <button
                  className="absolute inset-x-1 overflow-hidden rounded-4 px-1.5 py-0.5 text-left text-caption text-text-inverse focus-visible:focus-ring"
                  data-testid={`schedule-event-${event.id}`}
                  key={event.id}
                  onClick={() => onEventClick(event.id)}
                  style={{ top, height, backgroundColor: event.color }}
                  type="button"
                >
                  <span className="block truncate">
                    {toTimeKey(new Date(event.start))}-{toTimeKey(new Date(event.end))}{' '}
                    <span className="font-bold">{event.title}</span>
                  </span>
                </button>
              )
            })}
        </div>
      ))}
    </div>
  </div>
)
