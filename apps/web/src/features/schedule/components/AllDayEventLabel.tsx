import { clsx } from 'clsx'

import { allDayEventTitle, type CalendarAllDayEvent } from '../lib/allDayEvents'

export type AllDayEventLabelProps = {
  event: CalendarAllDayEvent
  /** true のとき、タイトルの前に職員の名前を出す。1 つの欄に複数の職員の予定が並ぶ月と週の表示で使う。 */
  withStaffName?: boolean
  className?: string
}

/**
 * Google カレンダーの終日の予定 1 件のラベル。buddy の予定ではないので押せない。
 * 時刻のある予定と見分けられるよう、面を薄くし、職員の色を左の線にだけ置く。
 */
export const AllDayEventLabel = ({
  event,
  withStaffName = false,
  className,
}: AllDayEventLabelProps) => (
  <span
    className={clsx(
      'block truncate rounded-4 border-l-4 bg-surface-subtle px-1.5 py-0.5 text-caption text-text',
      className,
    )}
    data-testid={`all-day-event-${event.id}`}
    style={{ borderColor: event.color }}
    title={`${event.staffName} ${allDayEventTitle(event)}`}
  >
    {withStaffName && <span className="font-bold">{event.staffName} </span>}
    {allDayEventTitle(event)}
  </span>
)
