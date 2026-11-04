import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import type { Schedule } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading, Modal } from '@buddy/ui'

import { getCalendarRange } from '../lib/calendarRange'
import { toDateKey } from '../lib/dateTime'
import { SCHEDULE_NOT_FOUND_MESSAGE, scheduleLoadErrorMessage } from '../lib/errorMessage'
import { canEditScheduleOf } from '../lib/schedulePermission'
import {
  facilityQueryOptions,
  patientListQueryOptions,
  scheduleListQueryOptions,
  scheduleQueryOptions,
  staffListQueryOptions,
} from '../queries'
import { pickCalendarSearch } from '../schema/scheduleSearch'
import { ScheduleDetailModal } from './ScheduleDetailModal'

/**
 * 予定を 1 件取り、詳細のモーダルに出す。閉じるとカレンダーに戻る。
 * ログインした職員が予定の職員の予定を編集できないときは、編集のボタンを出さない。
 * 職員の一覧を読み終えるまでは予定の職員のチームが分からないので、チームを対象にする権限では編集のボタンを出さない。
 *
 * Google カレンダーを予定の正本にする事業所（google_primary）の予定には 1 件の取得が無いので、カレンダーの search params の期間の
 * 予定を職員で絞らずに読み、確認が必要な予定と合わせた中から引く。Google カレンダーの予定には、編集のボタンを出さない。
 */
export const ScheduleDetailModalContainer = ({ scheduleId }: { scheduleId: Schedule['id'] }) => {
  const navigate = useNavigate()
  const search = useSearch({ from: '/schedule' })
  const calendarSearch = pickCalendarSearch(search)
  const { api, facilityId, viewer } = useBuddyApi()
  const [today] = useState(() => toDateKey(new Date()))

  const facilityQuery = useQuery(facilityQueryOptions(api, facilityId))
  const sourceMode = facilityQuery.data?.sourceMode
  const scheduleQuery = useQuery({
    ...scheduleQueryOptions(api, facilityId, scheduleId),
    enabled: sourceMode === 'buddy_primary',
  })
  const listQuery = useQuery({
    ...scheduleListQueryOptions(api, facilityId, {
      ...getCalendarRange(search.view, search.date ?? today),
      includeCancelled: search.cancelled,
    }),
    enabled: sourceMode === 'google_primary',
  })
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))

  const close = () => navigate({ to: '/schedule', search: calendarSearch })

  const activeQuery = sourceMode === 'google_primary' ? listQuery : scheduleQuery
  const error = facilityQuery.isError ? facilityQuery.error : activeQuery.error
  const listed = listQuery.data
  const schedule =
    sourceMode === 'google_primary'
      ? [...(listed?.schedules ?? []), ...(listed?.needsReview ?? [])].find(
          (s) => s.id === scheduleId,
        )
      : scheduleQuery.data
  if (
    schedule === undefined &&
    error === null &&
    (sourceMode === undefined || !activeQuery.isSuccess)
  ) {
    return (
      <Modal isOpen onCloseRequest={close} title="予定の詳細">
        <Loading />
      </Modal>
    )
  }
  if (schedule === undefined) {
    return (
      <Modal isOpen onCloseRequest={close} title="予定の詳細">
        <p className="p-5 text-danger" role="alert">
          {error === null ? SCHEDULE_NOT_FOUND_MESSAGE : scheduleLoadErrorMessage(error)}
        </p>
      </Modal>
    )
  }

  const staff = staffQuery.data?.find((s) => s.id === schedule.staffId)
  const canEdit =
    schedule.fromGoogleCalendar !== true &&
    canEditScheduleOf(viewer, { id: schedule.staffId, teamId: staff?.teamId ?? '' })
  return (
    <ScheduleDetailModal
      onClose={close}
      onEdit={
        canEdit
          ? () =>
              navigate({
                to: '/schedule/$scheduleId/edit',
                params: { scheduleId },
                search: calendarSearch,
              })
          : undefined
      }
      patient={patientsQuery.data?.find((patient) => patient.id === schedule.visit?.patientId)}
      schedule={schedule}
      staff={staff}
    />
  )
}
