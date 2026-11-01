import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'

import type { Patient, Schedule, Staff } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading, Modal } from '@buddy/ui'

import { toScheduleFormValues, toScheduleInput } from '../lib/scheduleFormMapper'
import {
  patientListQueryOptions,
  scheduleQueryOptions,
  staffListQueryOptions,
  useUpdateSchedule,
} from '../queries'
import { scheduleFormSchema, type ScheduleFormValues } from '../schema/scheduleForm'
import { pickCalendarSearch, type ScheduleSearch } from '../schema/scheduleSearch'
import { ScheduleFormModal } from './ScheduleFormModal'

type ScheduleEditFormProps = {
  schedule: Schedule
  staffList: Staff[]
  patients: Patient[]
  calendarSearch: ScheduleSearch
}

const ScheduleEditForm = ({
  schedule,
  staffList,
  patients,
  calendarSearch,
}: ScheduleEditFormProps) => {
  const navigate = useNavigate()
  const updateSchedule = useUpdateSchedule(schedule.id)
  const form = useForm<ScheduleFormValues>({
    defaultValues: toScheduleFormValues(schedule),
    resolver: zodResolver(scheduleFormSchema),
  })

  // 繰り返しの回を保存すると、回は新しい単発の予定に置き換わるので、保存した予定の ID の詳細へ戻る
  const backToDetail = (scheduleId: Schedule['id'] = schedule.id) =>
    navigate({
      to: '/schedule/$scheduleId',
      params: { scheduleId },
      search: calendarSearch,
    })

  return (
    <ScheduleFormModal
      form={form}
      onClose={() => backToDetail()}
      onSubmit={async (values) => {
        const saved = await updateSchedule.mutateAsync(toScheduleInput(values))
        await backToDetail(saved.id)
      }}
      patients={patients}
      staffList={staffList}
      submitError={updateSchedule.isError ? '予定を更新できませんでした。' : undefined}
      submitLabel="保存"
      submitTestId="schedule-edit-submit"
      cancelTestId="schedule-edit-cancel"
      title="予定の編集"
    />
  )
}

/** 予定を 1 件取り、その値を初期値にして編集のフォームを出す。保存すると詳細に戻る。 */
export const ScheduleEditModalContainer = ({ scheduleId }: { scheduleId: Schedule['id'] }) => {
  const navigate = useNavigate()
  const calendarSearch = pickCalendarSearch(useSearch({ from: '/schedule' }))
  const { api, facilityId } = useBuddyApi()
  const scheduleQuery = useQuery(scheduleQueryOptions(api, facilityId, scheduleId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))

  if (scheduleQuery.isPending || staffQuery.isPending || patientsQuery.isPending) {
    return (
      <Modal isOpen title="予定の編集">
        <Loading />
      </Modal>
    )
  }
  if (scheduleQuery.isError || staffQuery.isError || patientsQuery.isError) {
    return (
      <Modal
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5 text-danger" role="alert">
          予定を取得できませんでした。
        </p>
      </Modal>
    )
  }

  if (scheduleQuery.data.cancel !== undefined) {
    return (
      <Modal
        data-testid="schedule-edit-cancelled"
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5">キャンセルした予定は編集できません。</p>
      </Modal>
    )
  }

  return (
    <ScheduleEditForm
      calendarSearch={calendarSearch}
      patients={patientsQuery.data}
      schedule={scheduleQuery.data}
      staffList={staffQuery.data}
    />
  )
}
