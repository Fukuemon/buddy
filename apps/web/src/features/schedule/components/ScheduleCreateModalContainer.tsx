import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import type { ScheduleKind } from '#/api/types'
import { useBuddyApi } from '#/api/useBuddyApi'

import { activeStaffId } from '../lib/activeStaff'
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

  const [opened] = useState(() => ({
    date: search.start ?? search.date ?? today,
    time: search.time,
    staffId: search.staffId,
  }))
  const staffId = activeStaffId(opened.staffId, staffQuery.data)
  const initial = { ...opened, staffId }
  const form = useForm<ScheduleFormValues>({
    defaultValues: createScheduleFormValues({ kind: search.kind, ...initial }),
    resolver: zodResolver(scheduleFormSchema),
  })

  // 職員の一覧を開いた後に取り終え、URL の staffId が休職か退職の職員を指していたときは、未選択に戻す。
  // 初期値も戻して、閉じるときに破棄の確認を出さない。staffId の欄は開くまで登録されないので、resetField は使えない
  useEffect(() => {
    if (opened.staffId === undefined || staffId !== undefined) return
    form.reset(createScheduleFormValues({ kind: form.getValues('kind'), ...opened, staffId }), {
      keepDirtyValues: true,
    })
  }, [form, opened, staffId])

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
