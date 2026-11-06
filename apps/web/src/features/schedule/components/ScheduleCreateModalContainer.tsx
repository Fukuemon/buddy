import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import type { Patient, ScheduleKind, ServiceCodeRecord, Staff } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'
import { Loading, Modal } from '@buddy/ui'

import { activeStaffId } from '../lib/activeStaff'
import { toDateKey } from '../lib/dateTime'
import {
  SCHEDULE_OPTIONS_LOAD_ERROR_MESSAGE,
  scheduleSubmitErrorMessage,
} from '../lib/errorMessage'
import {
  createScheduleFormValues,
  defaultServiceCode,
  toScheduleInput,
} from '../lib/scheduleFormMapper'
import { newScheduleId } from '../lib/scheduleId'
import { editableStaff } from '../lib/schedulePermission'
import {
  patientListQueryOptions,
  serviceCodeListQueryOptions,
  staffListQueryOptions,
  useCreateSchedule,
} from '../queries'
import { createScheduleFormSchema, type ScheduleFormValues } from '../schema/scheduleForm'
import { pickCalendarSearch } from '../schema/scheduleSearch'
import { ScheduleFormModal } from './ScheduleFormModal'

type ScheduleCreateFormProps = {
  staffList: Staff[]
  staffCandidates: Staff[]
  patients: Patient[]
  serviceCodes: ServiceCodeRecord[]
  onClose: () => void
}

const ScheduleCreateForm = ({
  staffList,
  staffCandidates,
  patients,
  serviceCodes,
  onClose,
}: ScheduleCreateFormProps) => {
  const search = useSearch({ from: '/schedule/new' })
  const navigate = useNavigate({ from: '/schedule/new' })
  // フォームを開いたときに予定の ID を決め、送り直しでも同じ ID を送る。google_primary の事業所で、Google カレンダーの予定を 1 つのままにするためである
  const [scheduleId] = useState(newScheduleId)
  const createSchedule = useCreateSchedule(scheduleId)

  const [initial] = useState(() => {
    const staffId = activeStaffId(search.staffId, staffList)
    return {
      date: search.start ?? search.date ?? toDateKey(new Date()),
      time: search.time,
      staffId: staffCandidates.some((staff) => staff.id === staffId) ? staffId : undefined,
      serviceCode: defaultServiceCode(serviceCodes),
    }
  })
  const [schema] = useState(() => createScheduleFormSchema(serviceCodes))
  const form = useForm<ScheduleFormValues>({
    defaultValues: createScheduleFormValues({ kind: search.kind, ...initial }),
    resolver: zodResolver(schema),
    // 誤りの欄へのフォーカスは ScheduleForm が移す。react-hook-form は閉じた編集の欄の誤りにフォーカスを移せない
    shouldFocusError: false,
  })

  const changeKind = (kind: ScheduleKind) => {
    const current = form.getValues()
    form.reset(createScheduleFormValues({ kind, ...initial }))
    form.reset(
      createScheduleFormValues({
        kind,
        date: current.scheduleDate,
        time: current.startTime,
        staffId: current.staffId,
        serviceCode: initial.serviceCode,
      }),
      { keepDefaultValues: true },
    )
    void navigate({ search: (prev) => ({ ...prev, kind }), replace: true })
  }

  const submit = async (values: ScheduleFormValues) => {
    try {
      await createSchedule.mutateAsync(toScheduleInput(values))
    } catch {
      // 失敗の文は createSchedule.error から出す。
      return
    }
    await navigate({
      to: '/schedule',
      search: { ...pickCalendarSearch(search), date: values.scheduleDate },
    })
  }

  return (
    <ScheduleFormModal
      form={form}
      onClose={onClose}
      onKindChange={changeKind}
      onSubmit={submit}
      patients={patients}
      serviceCodes={serviceCodes}
      staffCandidates={staffCandidates}
      staffList={staffList}
      submitError={
        createSchedule.isError
          ? scheduleSubmitErrorMessage(createSchedule.error, '作成')
          : undefined
      }
      submitLabel="作成"
      submitTestId="schedule-create-submit"
      cancelTestId="schedule-new-cancel"
      title="予定の作成"
    />
  )
}

/**
 * `/schedule/new` の search params を初期値にして作成のフォームを出す。
 * 作成すると、作った予定の日のカレンダーに戻る。
 * 職員、利用者、サービスコードの一覧を読み終えるまでは読み込み中の表示を出し、読めなければフォームの代わりに失敗の文を出す。
 * 一度読めた後の読み直しが失敗しても、読めた一覧でフォームを出したままにし、入力を消さない。
 * 職員の候補は、ログインした職員が予定を作れる職員に限る。URL の staffId が候補の外の職員を指すときは、未選択で開く。
 * Google カレンダーを予定の正本にする事業所（google_primary）でも同じフォームを出し、予定の API が Google カレンダーに書く（ADR-0028）。
 * 予定の ID は、フォームを開いたときに決め、Google カレンダーに書けたかを確認できずに送り直すときも同じ ID を送る。
 */
export const ScheduleCreateModalContainer = () => {
  const search = useSearch({ from: '/schedule/new' })
  const navigate = useNavigate({ from: '/schedule/new' })
  const { api, facilityId, viewer } = useBuddyApi()

  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))
  const serviceCodesQuery = useQuery(serviceCodeListQueryOptions(api, facilityId))

  const close = () => navigate({ to: '/schedule', search: pickCalendarSearch(search) })

  const staffList = staffQuery.data
  const patients = patientsQuery.data
  const serviceCodes = serviceCodesQuery.data
  if (staffList === undefined || patients === undefined || serviceCodes === undefined) {
    if (!staffQuery.isError && !patientsQuery.isError && !serviceCodesQuery.isError) {
      return (
        <Modal isOpen onCloseRequest={close} title="予定の作成">
          <Loading />
        </Modal>
      )
    }
    return (
      <Modal isOpen onCloseRequest={close} title="予定の作成">
        <p className="p-5 text-danger" role="alert">
          {SCHEDULE_OPTIONS_LOAD_ERROR_MESSAGE}
        </p>
      </Modal>
    )
  }

  return (
    <ScheduleCreateForm
      onClose={close}
      patients={patients}
      serviceCodes={serviceCodes}
      staffCandidates={editableStaff(viewer, staffList)}
      staffList={staffList}
    />
  )
}
