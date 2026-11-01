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
  const createSchedule = useCreateSchedule()

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
    await createSchedule.mutateAsync(toScheduleInput(values))
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
