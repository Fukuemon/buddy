import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { toDateKey } from '../lib/dateTime'
import { resolveCalendarView } from '../schema/scheduleSearch'
import { ScheduleMiniCalendar } from './ScheduleMiniCalendar'

export type ScheduleMiniCalendarContainerProps = {
  /** 日を押して表示を移した後に呼ぶ。幅 768px 未満で、ドロワーを閉じるのに使う。 */
  onSelected?: () => void
}

/** `/schedule` の search params の表示の単位と日付を読み、押した日を date に書く。 */
export const ScheduleMiniCalendarContainer = ({
  onSelected,
}: ScheduleMiniCalendarContainerProps) => {
  const search = useSearch({ from: '/schedule' })
  const navigate = useNavigate({ from: '/schedule' })
  const [today] = useState(() => toDateKey(new Date()))

  return (
    <ScheduleMiniCalendar
      date={search.date ?? today}
      onSelect={(dateKey) => {
        void navigate({ search: (prev) => ({ ...prev, date: dateKey }) })
        onSelected?.()
      }}
      today={today}
      view={resolveCalendarView(search.view)}
    />
  )
}
