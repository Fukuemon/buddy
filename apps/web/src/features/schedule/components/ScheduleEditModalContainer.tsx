import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import type { Patient, Schedule, ServiceCodeRecord, Staff } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading, Modal } from '@buddy/ui'

import {
  SCHEDULE_EDIT_FORBIDDEN_MESSAGE,
  SCHEDULE_GOOGLE_PRIMARY_MESSAGE,
  SCHEDULE_LOAD_ERROR_MESSAGE,
  scheduleLoadErrorMessage,
  scheduleSubmitErrorMessage,
} from '../lib/errorMessage'
import { toScheduleFormValues, toScheduleInput } from '../lib/scheduleFormMapper'
import { canEditScheduleOf, editableStaff } from '../lib/schedulePermission'
import {
  facilityQueryOptions,
  patientListQueryOptions,
  scheduleQueryOptions,
  serviceCodeListQueryOptions,
  staffListQueryOptions,
  useUpdateSchedule,
} from '../queries'
import { createScheduleFormSchema, type ScheduleFormValues } from '../schema/scheduleForm'
import { pickCalendarSearch, type ScheduleSearch } from '../schema/scheduleSearch'
import { ScheduleFormModal } from './ScheduleFormModal'

type ScheduleEditFormProps = {
  schedule: Schedule
  staffList: Staff[]
  staffCandidates: Staff[]
  patients: Patient[]
  serviceCodes: ServiceCodeRecord[]
  calendarSearch: ScheduleSearch
}

const ScheduleEditForm = ({
  schedule,
  staffList,
  staffCandidates,
  patients,
  serviceCodes,
  calendarSearch,
}: ScheduleEditFormProps) => {
  const navigate = useNavigate()
  const updateSchedule = useUpdateSchedule(schedule.id)
  const [schema] = useState(() => createScheduleFormSchema(serviceCodes))
  const form = useForm<ScheduleFormValues>({
    defaultValues: toScheduleFormValues(schedule),
    resolver: zodResolver(schema),
    // 誤りの欄へのフォーカスは ScheduleForm が移す。react-hook-form は閉じた編集の欄の誤りにフォーカスを移せない
    shouldFocusError: false,
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
      serviceCodes={serviceCodes}
      staffCandidates={staffCandidates}
      staffList={staffList}
      submitError={
        updateSchedule.isError
          ? scheduleSubmitErrorMessage(updateSchedule.error, '更新')
          : undefined
      }
      submitLabel="保存"
      submitTestId="schedule-edit-submit"
      cancelTestId="schedule-edit-cancel"
      title="予定の編集"
    />
  )
}

/**
 * 予定を 1 件取り、その値を初期値にして編集のフォームを出す。保存すると詳細に戻る。
 * ログインした職員が予定の職員の予定を編集できないときは、フォームを出さずに権限が無いことを出す。
 * 職員の候補は、ログインした職員が予定を編集できる職員に限る。
 * 一度読めた後の読み直しが失敗しても、読めた値でフォームを出したままにし、入力を消さない。
 * Google カレンダーを予定の正本にする事業所（google_primary）では、フォームの代わりに Google カレンダーで変更する案内を出す。
 */
export const ScheduleEditModalContainer = ({ scheduleId }: { scheduleId: Schedule['id'] }) => {
  const navigate = useNavigate()
  const calendarSearch = pickCalendarSearch(useSearch({ from: '/schedule' }))
  const { api, facilityId, viewer } = useBuddyApi()
  const facilityQuery = useQuery(facilityQueryOptions(api, facilityId))
  // Google カレンダーの予定には 1 件の取得が無く 404 になるので、正本が buddy と分かってから読む。事業所を読めなければ、今までどおり読む
  const scheduleQuery = useQuery({
    ...scheduleQueryOptions(api, facilityId, scheduleId),
    enabled: facilityQuery.isError || facilityQuery.data?.sourceMode === 'buddy_primary',
  })
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))
  const serviceCodesQuery = useQuery(serviceCodeListQueryOptions(api, facilityId))

  if (facilityQuery.data?.sourceMode === 'google_primary') {
    return (
      <Modal
        data-testid="schedule-edit-google-primary"
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5">{SCHEDULE_GOOGLE_PRIMARY_MESSAGE}</p>
      </Modal>
    )
  }

  const schedule = scheduleQuery.data
  const staffList = staffQuery.data
  const patients = patientsQuery.data
  const serviceCodes = serviceCodesQuery.data
  if (
    schedule === undefined ||
    staffList === undefined ||
    patients === undefined ||
    serviceCodes === undefined
  ) {
    const failed =
      scheduleQuery.isError ||
      staffQuery.isError ||
      patientsQuery.isError ||
      serviceCodesQuery.isError
    if (!failed) {
      return (
        <Modal isOpen title="予定の編集">
          <Loading />
        </Modal>
      )
    }
    return (
      <Modal
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5 text-danger" role="alert">
          {scheduleQuery.isError
            ? scheduleLoadErrorMessage(scheduleQuery.error)
            : SCHEDULE_LOAD_ERROR_MESSAGE}
        </p>
      </Modal>
    )
  }

  const owner = staffList.find((staff) => staff.id === schedule.staffId)
  if (!canEditScheduleOf(viewer, { id: schedule.staffId, teamId: owner?.teamId ?? '' })) {
    return (
      <Modal
        data-testid="schedule-edit-forbidden"
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5">{SCHEDULE_EDIT_FORBIDDEN_MESSAGE}</p>
      </Modal>
    )
  }

  if (schedule.cancel !== undefined) {
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
      patients={patients}
      serviceCodes={serviceCodes}
      schedule={schedule}
      staffCandidates={editableStaff(viewer, staffList)}
      staffList={staffList}
    />
  )
}
