import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type ComponentProps } from 'react'

import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading } from '@buddy/ui'

import { activeStaff, activeStaffIds, excludeInactiveStaffSchedules } from '../lib/activeStaff'
import { getCalendarRange, shiftCalendarDate } from '../lib/calendarRange'
import {
  canEditAnySchedule,
  canEditScheduleOf,
  readableStaff,
  readableStaffIds,
} from '../lib/schedulePermission'
import { toDateKey } from '../lib/dateTime'
import { nowForDay, useNow } from '../lib/useNow'
import { toCalendarEvents } from '../lib/toCalendarEvents'
import {
  patientListQueryOptions,
  scheduleListQueryOptions,
  staffListQueryOptions,
} from '../queries'
import { pickCalendarSearch, type ScheduleSearch } from '../schema/scheduleSearch'
import { ScheduleCalendar } from './ScheduleCalendar'
import { ScheduleCalendarToolbar, type StaffFilterToggle } from './ScheduleCalendarToolbar'
import { StaffScheduleDayGrid } from './StaffScheduleDayGrid'

/** 日の表示だけが 1 分ごとに描き直されるよう、今の時刻をここで読んで日の表に渡す。 */
const DayGridWithNow = (props: Omit<ComponentProps<typeof StaffScheduleDayGrid>, 'now'>) => {
  const now = useNow()
  return <StaffScheduleDayGrid {...props} now={nowForDay(props.date, now)} />
}

export type ScheduleCalendarContainerProps = {
  /** 渡したときだけ、ツールバーに職員の絞り込みを開くボタンを出す。 */
  staffFilterToggle?: StaffFilterToggle
}

/**
 * `/schedule` の search params を読み、予定を取ってカレンダーに出す。
 * 職員の列は、ログインした職員が予定を見てよい職員に限る。「予定を作成」は誰かの予定を編集できる職員にだけ出し、
 * 時間の枠は、予定を編集できる職員の列でだけ押せる。
 */
export const ScheduleCalendarContainer = ({
  staffFilterToggle,
}: ScheduleCalendarContainerProps) => {
  const search = useSearch({ from: '/schedule' })
  const navigate = useNavigate({ from: '/schedule' })
  const { api, facilityId, viewer } = useBuddyApi()

  const [today] = useState(() => toDateKey(new Date()))
  const date = search.date ?? today
  const range = getCalendarRange(search.view, date)

  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const selectedStaffIds = readableStaffIds(
    viewer,
    activeStaffIds(search.staff, staffQuery.data),
    staffQuery.data,
  )
  const schedulesQuery = useQuery(
    scheduleListQueryOptions(api, facilityId, {
      ...range,
      staffIds: selectedStaffIds,
      includeCancelled: search.cancelled,
    }),
  )
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))

  const updateSearch = (patch: Partial<ScheduleSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) })

  const openCreate = (start: string, time?: string, staffId?: string) =>
    navigate({
      to: '/schedule/new',
      search: { ...pickCalendarSearch(search), start, time, staffId },
    })

  const openDetail = (scheduleId: string) =>
    navigate({
      to: '/schedule/$scheduleId',
      params: { scheduleId },
      search: pickCalendarSearch(search),
    })

  const allStaff = staffQuery.data ?? []
  const staffList = readableStaff(viewer, activeStaff(allStaff))
  const canCreate = canEditAnySchedule(viewer)
  const visibleStaff =
    selectedStaffIds.length === 0
      ? staffList
      : staffList.filter((staff) => selectedStaffIds.includes(staff.id))
  const events = toCalendarEvents(
    excludeInactiveStaffSchedules(schedulesQuery.data ?? [], allStaff),
    staffList,
    patientsQuery.data ?? [],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="px-2 py-2 desktop:px-6">
        <ScheduleCalendarToolbar
          date={date}
          onNext={() => updateSearch({ date: shiftCalendarDate(search.view, date, 1) })}
          onPrev={() => updateSearch({ date: shiftCalendarDate(search.view, date, -1) })}
          onCreate={canCreate ? () => openCreate(date) : undefined}
          onToday={() => updateSearch({ date: undefined })}
          onViewChange={(view) => updateSearch({ view })}
          staffFilterToggle={staffFilterToggle}
          view={search.view}
        />
      </div>
      <div className="min-h-0 grow px-2 pb-4 desktop:px-6">
        {schedulesQuery.isPending || staffQuery.isPending ? (
          <Loading description="カレンダーを表示中..." />
        ) : schedulesQuery.isError || staffQuery.isError ? (
          <p className="p-4 text-danger" role="alert">
            予定を取得できませんでした。
          </p>
        ) : search.view === 'day' ? (
          <DayGridWithNow
            date={date}
            events={events}
            onEventClick={openDetail}
            canCreateFor={(staff) => canEditScheduleOf(viewer, staff)}
            onSlotClick={(staffId, time) => openCreate(date, time, staffId)}
            staffList={visibleStaff}
          />
        ) : (
          <ScheduleCalendar
            date={date}
            events={events}
            onDateClick={(dateKey, time) =>
              time === undefined
                ? updateSearch({ view: 'day', date: dateKey })
                : canCreate
                  ? openCreate(dateKey, time)
                  : undefined
            }
            onEventClick={openDetail}
            view={search.view}
          />
        )}
      </div>
    </div>
  )
}
