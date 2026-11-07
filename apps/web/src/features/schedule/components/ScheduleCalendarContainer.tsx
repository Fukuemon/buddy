import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type ComponentProps } from 'react'

import { failedBeforeLoad, hasRefetchFailed, refetchFailedQueries } from '#/api/refetch'
import type { Staff } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { RefetchErrorMessage } from '#/components/page/RefetchErrorMessage'
import { Loading, useIsDesktop } from '@buddy/ui'

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
  facilityQueryOptions,
  patientListQueryOptions,
  scheduleListQueryOptions,
  staffListQueryOptions,
} from '../queries'
import {
  pickCalendarSearch,
  resolveCalendarView,
  type ScheduleSearch,
} from '../schema/scheduleSearch'
import { ScheduleCalendar } from './ScheduleCalendar'
import { ScheduleCalendarToolbar, type StaffFilterToggle } from './ScheduleCalendarToolbar'
import { ScheduleSourceNotices } from './ScheduleSourceNotices'
import { ScheduleWeekAgenda } from './ScheduleWeekAgenda'
import { StaffScheduleDayGrid } from './StaffScheduleDayGrid'

/** 日の表示だけが 1 分ごとに描き直されるよう、今の時刻をここで読んで日の表に渡す。 */
const DayGridWithNow = (props: Omit<ComponentProps<typeof StaffScheduleDayGrid>, 'now'>) => {
  const now = useNow()
  return <StaffScheduleDayGrid {...props} now={nowForDay(props.date, now)} />
}

/** 同期が古いかを 1 分ごとに決め直すよう、今の時刻をここで読んで通知に渡す。 */
const SourceNoticesWithNow = (props: Omit<ComponentProps<typeof ScheduleSourceNotices>, 'now'>) => {
  const now = useNow()
  return <ScheduleSourceNotices {...props} now={now} />
}

/** ログインした職員の列を左端に置く。外で日の表示を開いた職員が、横に送らずに自分の予定を見られるようにする。 */
const viewerFirst = (staffList: Staff[], viewerStaffId: Staff['id']) => [
  ...staffList.filter((staff) => staff.id === viewerStaffId),
  ...staffList.filter((staff) => staff.id !== viewerStaffId),
]

export type ScheduleCalendarContainerProps = {
  /** 渡したときだけ、ツールバーに職員の絞り込みを開くボタンを出す。 */
  staffFilterToggle?: StaffFilterToggle
}

/**
 * `/schedule` の search params を読み、予定を取ってカレンダーに出す。
 * 職員の列は、ログインした職員が予定を見てよい職員に限る。「予定を作成」は誰かの予定を編集できる職員にだけ出し、
 * 時間の枠は、予定を編集できる職員の列でだけ押せる。
 * 幅 768px 未満の週の表示は、時刻の格子の代わりに、予定を日ごとに縦に並べる週の一覧で出す。日の表示は、ログインした職員の列を左端に置く。
 * Google カレンダーを予定の正本にする事業所（google_primary）でも予定を作る操作を出し、予定の API が Google カレンダーに書く（ADR-0028）。
 * 予定の正本を buddy に切り替えている間は、予定を作る操作を出さない。カレンダーの上には、Google カレンダーと buddy のどちらでも
 * 予定を変えられる案内、切り替え中の案内、同期の警告、確認が必要な予定の通知を出す。事業所の正本は、予定の一覧か事業所から読む。
 */
export const ScheduleCalendarContainer = ({
  staffFilterToggle,
}: ScheduleCalendarContainerProps) => {
  const search = useSearch({ from: '/schedule' })
  const navigate = useNavigate({ from: '/schedule' })
  const { api, facilityId, viewer } = useBuddyApi()
  const isDesktop = useIsDesktop()

  const [today] = useState(() => toDateKey(new Date()))
  const view = resolveCalendarView(search.view)
  const date = search.date ?? today
  const range = getCalendarRange(view, date)

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
  const facilityQuery = useQuery(facilityQueryOptions(api, facilityId))
  // 日付を移ると一覧を読み直す間は一覧の値が無いので、事業所の値で予定を作る操作を出し分け、ちらつかせない
  const sourceMode = schedulesQuery.data?.sourceMode ?? facilityQuery.data?.sourceMode
  // google_primary の事業所では、予定の正本を切り替えている間（一覧の cutover）は予定を作らせない。一覧を読み直す間は、切り替え中かが分からないので出さない
  const canWriteSchedules =
    sourceMode === 'buddy_primary' ||
    (sourceMode === 'google_primary' &&
      schedulesQuery.data !== undefined &&
      schedulesQuery.data.cutover === null)

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
  const canCreate = canWriteSchedules && canEditAnySchedule(viewer)
  const visibleStaff = viewerFirst(
    selectedStaffIds.length === 0
      ? staffList
      : staffList.filter((staff) => selectedStaffIds.includes(staff.id)),
    viewer.staffId,
  )
  const events = toCalendarEvents(
    excludeInactiveStaffSchedules(schedulesQuery.data?.schedules ?? [], allStaff),
    staffList,
    patientsQuery.data ?? [],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="px-2 py-2 desktop:px-6">
        <ScheduleCalendarToolbar
          date={date}
          onNext={() => updateSearch({ date: shiftCalendarDate(view, date, 1) })}
          onPrev={() => updateSearch({ date: shiftCalendarDate(view, date, -1) })}
          onCreate={canCreate ? () => openCreate(date) : undefined}
          onToday={() => updateSearch({ date: undefined })}
          onViewChange={(view) => updateSearch({ view })}
          staffFilterToggle={staffFilterToggle}
          view={view}
        />
      </div>
      {hasRefetchFailed([schedulesQuery, staffQuery]) && (
        <div className="px-2 pb-2 desktop:px-6">
          <RefetchErrorMessage onRetry={() => refetchFailedQueries([schedulesQuery, staffQuery])} />
        </div>
      )}
      {sourceMode === 'google_primary' && (
        <div className="px-2 pb-2 desktop:px-6">
          <SourceNoticesWithNow
            calendarSyncs={schedulesQuery.data?.calendarSyncs ?? []}
            cutover={schedulesQuery.data?.cutover ?? null}
            needsReview={schedulesQuery.data?.needsReview ?? []}
            onOpenSchedule={openDetail}
            sourceMode={sourceMode}
            staffList={allStaff}
          />
        </div>
      )}
      <div className="min-h-0 grow px-2 pb-4 desktop:px-6">
        {schedulesQuery.isPending || staffQuery.isPending ? (
          <Loading description="カレンダーを表示中..." />
        ) : failedBeforeLoad([schedulesQuery, staffQuery]) !== undefined ? (
          <p className="p-4 text-danger" role="alert">
            予定を取得できませんでした。
          </p>
        ) : view === 'week' && !isDesktop ? (
          <ScheduleWeekAgenda
            date={date}
            events={events}
            onDayClick={(dateKey) => updateSearch({ view: 'day', date: dateKey })}
            onEventClick={openDetail}
            staffList={staffList}
            today={today}
          />
        ) : view === 'day' ? (
          <DayGridWithNow
            date={date}
            events={events}
            onEventClick={openDetail}
            canCreateFor={(staff) => canWriteSchedules && canEditScheduleOf(viewer, staff)}
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
            view={view}
          />
        )}
      </div>
    </div>
  )
}
