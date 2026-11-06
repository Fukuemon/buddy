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
  SCHEDULE_LOAD_ERROR_MESSAGE,
  isGoogleEventChanged,
  scheduleLoadErrorMessage,
  scheduleSubmitErrorMessage,
} from '../lib/errorMessage'
import { toScheduleFormValues, toScheduleInput } from '../lib/scheduleFormMapper'
import { canEditScheduleOf, editableStaff } from '../lib/schedulePermission'
import {
  patientListQueryOptions,
  scheduleQueryOptions,
  serviceCodeListQueryOptions,
  staffListQueryOptions,
  useUpdateSchedule,
} from '../queries'
import { createScheduleFormSchema, type ScheduleFormValues } from '../schema/scheduleForm'
import { pickCalendarSearch, type ScheduleSearch } from '../schema/scheduleSearch'
import { ScheduleFormModal } from './ScheduleFormModal'
import { ScheduleLatestNotice } from './ScheduleLatestNotice'

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
  const { api, facilityId } = useBuddyApi()
  const updateSchedule = useUpdateSchedule(schedule.id)
  // 編集を開いたときの etag で保存する。Google カレンダーで変わっていたら、読み直した最新の予定の etag に置き換える
  const [etag, setETag] = useState(schedule.etag ?? null)
  const [latest, setLatest] = useState<Schedule>()
  const [schema] = useState(() => createScheduleFormSchema(serviceCodes))
  const form = useForm<ScheduleFormValues>({
    defaultValues: toScheduleFormValues(schedule),
    resolver: zodResolver(schema),
    // 誤りの欄へのフォーカスは ScheduleForm が移す。react-hook-form は閉じた編集の欄の誤りにフォーカスを移せない
    shouldFocusError: false,
  })

  // 繰り返しの回を保存すると、回は新しい単発の予定に置き換わるので、保存した予定の ID の詳細へ戻る。
  // Google カレンダーの予定の詳細はカレンダーの期間の一覧から引くので、保存した日をカレンダーの日にする
  const backToDetail = (scheduleId: Schedule['id'] = schedule.id, date = calendarSearch.date) =>
    navigate({
      to: '/schedule/$scheduleId',
      params: { scheduleId },
      search: { ...calendarSearch, date },
    })

  return (
    <ScheduleFormModal
      form={form}
      onClose={() => backToDetail()}
      notice={
        latest === undefined ? undefined : (
          <ScheduleLatestNotice latest={latest} patients={patients} staffList={staffList} />
        )
      }
      onSubmit={async (values) => {
        try {
          const saved = await updateSchedule.mutateAsync({ input: toScheduleInput(values), etag })
          await backToDetail(saved.id, values.scheduleDate)
        } catch (error) {
          if (!isGoogleEventChanged(error)) return
          const current = await api.schedules.get(facilityId, schedule.id).catch(() => undefined)
          if (current === undefined) return
          setLatest(current)
          setETag(current.etag ?? null)
        }
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
 * Google カレンダーを予定の正本にする事業所（google_primary）でも同じフォームを出し、編集を開いたときに読んだ予定の etag で保存する（ADR-0028）。
 * 開いた後に Google カレンダーで予定が変わっていたら（409 の google_event_changed）、入力を残したまま、フォームの上に最新の予定を出し、
 * etag を最新の予定の etag に置き換える。もう一度保存すると、最新の予定を入力の内容にする。
 * buddy の繰り返しの規則に写せない Google カレンダーの予定（recurrence_unsupported）は、フォームを出さずに変えられないことを出す。
 */
export const ScheduleEditModalContainer = ({ scheduleId }: { scheduleId: Schedule['id'] }) => {
  const navigate = useNavigate()
  const calendarSearch = pickCalendarSearch(useSearch({ from: '/schedule' }))
  const { api, facilityId, viewer } = useBuddyApi()
  const scheduleQuery = useQuery(scheduleQueryOptions(api, facilityId, scheduleId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))
  const serviceCodesQuery = useQuery(serviceCodeListQueryOptions(api, facilityId))

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

  if (schedule.reviewReason === 'recurrence_unsupported') {
    return (
      <Modal
        data-testid="schedule-edit-recurrence-unsupported"
        isOpen
        onCloseRequest={() => navigate({ to: '/schedule', search: calendarSearch })}
        title="予定の編集"
      >
        <p className="p-5">
          この予定の繰り返しの規則は buddy で表せないため、buddy では変更できません。Google
          カレンダーで変更してください。
        </p>
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
