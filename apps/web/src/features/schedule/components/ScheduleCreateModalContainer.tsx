import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import type { ScheduleKind } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'

import { toDateKey } from '../lib/dateTime'
import { createScheduleFormValues, toScheduleInput } from '../lib/scheduleFormMapper'
import { patientListQueryOptions, staffListQueryOptions, useCreateSchedule } from '../queries'
import { scheduleFormSchema, type ScheduleFormValues } from '../schema/scheduleForm'
import { pickCalendarSearch } from '../schema/scheduleSearch'
import { ScheduleFormModal } from './ScheduleFormModal'

/**
 * `/schedule/new` の search params を初期値にして作成のフォームを出す。
 * 作成すると、作った予定の日のカレンダーに戻る。
 */
export const ScheduleCreateModalContainer = () => {
  const search = useSearch({ from: '/schedule/new' })
  const navigate = useNavigate({ from: '/schedule/new' })
  const { api, facilityId } = useBuddyApi()
  const [today] = useState(() => toDateKey(new Date()))

  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const patientsQuery = useQuery(patientListQueryOptions(api, facilityId))
  const createSchedule = useCreateSchedule()

  const [initial] = useState(() => ({
    date: search.start ?? search.date ?? today,
    time: search.time,
    staffId: search.staffId,
  }))
  const form = useForm<ScheduleFormValues>({
    defaultValues: createScheduleFormValues({ kind: search.kind, ...initial }),
    resolver: zodResolver(scheduleFormSchema),
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
      }),
      { keepDefaultValues: true },
    )
    void navigate({ search: (prev) => ({ ...prev, kind }), replace: true })
  }

  const close = () => navigate({ to: '/schedule', search: pickCalendarSearch(search) })

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
      onClose={close}
      onKindChange={changeKind}
      onSubmit={submit}
      patients={patientsQuery.data ?? []}
      staffList={staffQuery.data ?? []}
      submitError={createSchedule.isError ? '予定を作成できませんでした。' : undefined}
      submitLabel="作成"
      submitTestId="schedule-create-submit"
      title="予定の作成"
    />
  )
}
