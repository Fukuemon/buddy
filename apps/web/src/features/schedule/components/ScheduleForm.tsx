import { useState } from 'react'
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form'

import type { Patient, ServiceCodeRecord, Staff } from '#/api/types'
import { TextareaField } from '@buddy/ui'

import { SCHEDULE_CATEGORY_LABEL } from '../constants/scheduleLabels'
import { activePatients } from '#/api/activePatients'
import { activeStaff } from '../lib/activeStaff'
import { formatEndTime, visitEndOfInput } from '../lib/scheduleFormMapper'
import type { ScheduleFormValues } from '../schema/scheduleForm'
import { PatientSelectList } from './PatientSelectList'
import { ScheduleCategoryCheckboxGroup } from './ScheduleCategoryCheckboxGroup'
import { ScheduleDateTimeEdit } from './ScheduleDateTimeEdit'
import { ScheduleFieldSummaryList, type ScheduleFieldSummaryItem } from './ScheduleFieldSummaryList'
import { StaffSelectList } from './StaffSelectList'

type FieldId = 'title' | 'date-time' | 'patient' | 'staff' | 'category' | 'description'

/** 選ぶ項目で、まだ選んでいないときに出す文。 */
const SELECT_PLACEHOLDER = '選んでください'

export type ScheduleFormProps = {
  /** 送信のボタンをフォームの外（モーダルの下端）に置くため、form 要素の id を受け取る。 */
  id: string
  form: UseFormReturn<ScheduleFormValues>
  staffList: Staff[]
  /** 職員の候補。省くと staffList の全員を候補にする。どちらでも、止めた職員は候補に出さない。 */
  staffCandidates?: Staff[]
  patients: Patient[]
  /** 予定の API のサービスコードの一覧。訪問の予定のサービスコードの選択肢にする。 */
  serviceCodes: readonly ServiceCodeRecord[]
  onSubmit: (values: ScheduleFormValues) => void | Promise<void>
}

/**
 * 予定の作成と編集のフォーム。左に項目の要約を並べ、右に選んだ項目の編集の欄を出す。
 * 通常と訪問の切り替えは持たず、form の kind の値に従う。
 * 職員の候補には止めた職員を出さない。今の値が止めた職員なら、要約に名前を出したまま値を変えない。
 */
export const ScheduleForm = ({
  id,
  form,
  staffList,
  staffCandidates = staffList,
  patients,
  serviceCodes,
  onSubmit,
}: ScheduleFormProps) => {
  const [activeField, setActiveField] = useState<FieldId>('date-time')
  const { control, formState, handleSubmit } = form
  const values = useWatch({ control }) as Partial<ScheduleFormValues>
  const errors = formState.errors as Partial<Record<string, { message?: string }>>
  const isVisit = values.kind === 'visit'

  const staffName = staffList.find((staff) => staff.id === values.staffId)?.name
  const patientId = isVisit ? (values as { patientId?: string }).patientId : undefined
  const patientName = patients.find((patient) => patient.id === patientId)?.name

  const dateTimeSummary = (() => {
    if (values.kind === 'visit') {
      const end = visitEndOfInput(values.startTime, values.serviceTime)
      const serviceTime = Number.isFinite(values.serviceTime) ? values.serviceTime : '-'
      return `${values.scheduleDate ?? ''} ${values.startTime ?? ''} - ${end === undefined ? '-' : formatEndTime(end)}（${serviceTime} 分、${values.serviceCode ?? ''}）`
    }
    const endTime =
      values.kind === 'normal'
        ? formatEndTime({
            endTime: values.endTime ?? '',
            endsNextDay: values.endsNextDay === true,
          })
        : ''
    return `${values.scheduleDate ?? ''} ${values.startTime ?? ''} - ${endTime}`
  })()

  const items: ScheduleFieldSummaryItem<FieldId>[] = [
    ...(isVisit
      ? []
      : [
          {
            id: 'title' as const,
            label: 'タイトル',
            content: values.kind === 'normal' && values.title ? values.title : undefined,
            error: errors.title?.message,
          },
        ]),
    {
      id: 'date-time',
      label: isVisit ? '訪問日時' : '予定日時',
      content: dateTimeSummary,
      error:
        errors.scheduleDate?.message ??
        errors.startTime?.message ??
        errors.endTime?.message ??
        errors.serviceCode?.message ??
        errors.serviceTime?.message,
    },
    ...(isVisit
      ? [
          {
            id: 'patient' as const,
            label: '利用者',
            content: patientName,
            placeholder: SELECT_PLACEHOLDER,
            error: errors.patientId?.message,
          },
        ]
      : []),
    {
      id: 'staff',
      label: isVisit ? '主訪問者' : '予定者',
      content: staffName,
      placeholder: SELECT_PLACEHOLDER,
      error: errors.staffId?.message,
    },
    ...(isVisit
      ? [
          {
            id: 'category' as const,
            label: '訪問の区分',
            content:
              values.kind === 'visit' &&
              values.categories !== undefined &&
              values.categories.length > 0
                ? values.categories.map((category) => SCHEDULE_CATEGORY_LABEL[category]).join('、')
                : '通常',
          },
        ]
      : []),
    { id: 'description', label: 'メモ', content: values.description || undefined },
  ]

  const visibleField = items.some((item) => item.id === activeField) ? activeField : 'date-time'

  return (
    <form
      className="grid gap-6 p-5 desktop:grid-cols-[16rem_minmax(0,1fr)]"
      data-testid="schedule-form"
      id={id}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <ScheduleFieldSummaryList activeId={visibleField} items={items} onSelect={setActiveField} />
      <div>
        {visibleField === 'title' && (
          <TextareaField
            control={control}
            data-testid="schedule-form-title"
            label="タイトル"
            name="title"
          />
        )}
        {visibleField === 'date-time' && (
          <ScheduleDateTimeEdit form={form} serviceCodes={serviceCodes} />
        )}
        {visibleField === 'patient' && (
          <Controller
            control={control}
            name="patientId"
            render={({ field }) => (
              <PatientSelectList
                onChange={field.onChange}
                patients={activePatients(patients)}
                value={field.value ?? ''}
              />
            )}
          />
        )}
        {visibleField === 'staff' && (
          <Controller
            control={control}
            name="staffId"
            render={({ field }) => (
              <StaffSelectList
                heading={isVisit ? '主訪問者を選んでください' : '予定者を選んでください'}
                onChange={field.onChange}
                staffList={activeStaff(staffCandidates)}
                value={field.value}
              />
            )}
          />
        )}
        {visibleField === 'category' && (
          <Controller
            control={control}
            name="categories"
            render={({ field }) => (
              <ScheduleCategoryCheckboxGroup onChange={field.onChange} value={field.value ?? []} />
            )}
          />
        )}
        {visibleField === 'description' && (
          <TextareaField
            control={control}
            data-testid="schedule-form-description"
            label="メモ"
            name="description"
          />
        )}
      </div>
    </form>
  )
}
