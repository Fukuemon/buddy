import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading } from '#/components/base/Loading'

import { getCalendarRange, shiftCalendarDate } from '../lib/calendarRange'
import { toDateKey } from '../lib/dateTime'
import { toCalendarEvents } from '../lib/toCalendarEvents'
import {
  patientListQueryOptions,
  scheduleListQueryOptions,
  staffListQueryOptions,
} from '../queries'
import type { ScheduleSearch } from '../schema/scheduleSearch'
import { ScheduleCalendar } from './ScheduleCalendar'
import { ScheduleCalendarToolbar } from './ScheduleCalendarToolbar'
import { StaffScheduleDayGrid } from './StaffScheduleDayGrid'

/** `/schedule` の search params を読み、予定を取ってカレンダーに出す。 */
export const ScheduleCalendarContainer = () => {
  const search = useSearch({ from: '/schedule' })
  const navigate = useNavigate({ from: '/schedule' })
  const { api, facilityId } = useBuddyApi()

  const [today] = useState(() => toDateKey(new Date()))
  const date = search.date ?? today
  const range = getCalendarRange(search.view, date)

  const schedulesQuery = useQuery(
    scheduleListQueryOptions(api, facilityId, { ...range, staffIds: search.staff }),
  )
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))

  const updateSearch = (patch: Partial<ScheduleSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) })

  const staffList = staffQuery.data ?? []
  const visibleStaff =
    search.staff.length === 0
      ? staffList
      : staffList.filter((staff) => search.staff.includes(staff.id))
  const events = toCalendarEvents(schedulesQuery.data ?? [], staffList, patientsQuery.data ?? [])

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-2">
        <ScheduleCalendarToolbar
          date={date}
          onDateChange={(dateKey) => updateSearch({ date: dateKey })}
          onNext={() => updateSearch({ date: shiftCalendarDate(search.view, date, 1) })}
          onPrev={() => updateSearch({ date: shiftCalendarDate(search.view, date, -1) })}
          onToday={() => updateSearch({ date: undefined })}
          onViewChange={(view) => updateSearch({ view })}
          view={search.view}
        />
      </div>
      <div className="min-h-0 grow px-6 pb-4">
        {schedulesQuery.isPending || staffQuery.isPending ? (
          <Loading description="カレンダーを表示中..." />
        ) : schedulesQuery.isError || staffQuery.isError ? (
          <p className="p-4 text-incorrect-main" role="alert">
            予定を取得できませんでした。
          </p>
        ) : search.view === 'day' ? (
          <StaffScheduleDayGrid
            events={events}
            onEventClick={() => {}}
            onSlotClick={() => {}}
            staffList={visibleStaff}
          />
        ) : (
          <ScheduleCalendar
            date={date}
            events={events}
            onDateClick={(dateKey) => updateSearch({ view: 'day', date: dateKey })}
            onEventClick={() => {}}
            view={search.view}
          />
        )}
      </div>
    </div>
  )
}
