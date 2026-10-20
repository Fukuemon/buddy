import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { ApiError } from '#/api/client'
import type { Schedule } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading, Modal } from '@buddy/ui'

import { patientListQueryOptions, scheduleQueryOptions, staffListQueryOptions } from '../queries'
import { pickCalendarSearch } from '../schema/scheduleSearch'
import { ScheduleDetailModal } from './ScheduleDetailModal'

/** 予定を 1 件取り、詳細のモーダルに出す。閉じるとカレンダーに戻る。 */
export const ScheduleDetailModalContainer = ({ scheduleId }: { scheduleId: Schedule['id'] }) => {
  const navigate = useNavigate()
  const calendarSearch = pickCalendarSearch(useSearch({ from: '/schedule' }))
  const { api, facilityId } = useBuddyApi()
  const scheduleQuery = useQuery(scheduleQueryOptions(api, facilityId, scheduleId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))

  const close = () => navigate({ to: '/schedule', search: calendarSearch })

  if (scheduleQuery.isPending) {
    return (
      <Modal isOpen onCloseRequest={close} title="予定の詳細">
        <Loading />
      </Modal>
    )
  }
  if (scheduleQuery.isError) {
    const notFound = scheduleQuery.error instanceof ApiError && scheduleQuery.error.status === 404
    return (
      <Modal isOpen onCloseRequest={close} title="予定の詳細">
        <p className="p-5 text-danger" role="alert">
          {notFound ? '予定が見つかりません。' : '予定を取得できませんでした。'}
        </p>
      </Modal>
    )
  }

  const schedule = scheduleQuery.data
  return (
    <ScheduleDetailModal
      onClose={close}
      onEdit={() =>
        navigate({
          to: '/schedule/$scheduleId/edit',
          params: { scheduleId },
          search: calendarSearch,
        })
      }
      patient={patientsQuery.data?.find((patient) => patient.id === schedule.visit?.patientId)}
      schedule={schedule}
      staff={staffQuery.data?.find((staff) => staff.id === schedule.staffId)}
    />
  )
}
