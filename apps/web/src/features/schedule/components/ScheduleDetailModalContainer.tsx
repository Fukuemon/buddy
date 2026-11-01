import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import type { Schedule } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading, Modal } from '@buddy/ui'

import { scheduleLoadErrorMessage } from '../lib/errorMessage'
import { canEditScheduleOf } from '../lib/schedulePermission'
import { patientListQueryOptions, scheduleQueryOptions, staffListQueryOptions } from '../queries'
import { pickCalendarSearch } from '../schema/scheduleSearch'
import { ScheduleDetailModal } from './ScheduleDetailModal'

/**
 * 予定を 1 件取り、詳細のモーダルに出す。閉じるとカレンダーに戻る。
 * ログインした職員が予定の職員の予定を編集できないときは、編集のボタンを出さない。
 * 職員の一覧を読み終えるまでは予定の職員のチームが分からないので、チームを対象にする権限では編集のボタンを出さない。
 */
export const ScheduleDetailModalContainer = ({ scheduleId }: { scheduleId: Schedule['id'] }) => {
  const navigate = useNavigate()
  const calendarSearch = pickCalendarSearch(useSearch({ from: '/schedule' }))
  const { api, facilityId, viewer } = useBuddyApi()
  const scheduleQuery = useQuery(scheduleQueryOptions(api, facilityId, scheduleId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))

  const close = () => navigate({ to: '/schedule', search: calendarSearch })

  const schedule = scheduleQuery.data
  if (schedule === undefined && !scheduleQuery.isError) {
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
          {scheduleLoadErrorMessage(scheduleQuery.error)}
        </p>
      </Modal>
    )
  }

  const staff = staffQuery.data?.find((s) => s.id === schedule.staffId)
  const canEdit = canEditScheduleOf(viewer, { id: schedule.staffId, teamId: staff?.teamId ?? '' })
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
