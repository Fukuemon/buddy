import { useState } from 'react'
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form'

import type { Patient, Staff } from '#/api/types'
import { TextareaField } from '@buddy/ui'

import { SCHEDULE_CATEGORY_LABEL } from '../constants/scheduleLabels'
import { visitEndTime } from '../lib/scheduleFormMapper'
import type { ScheduleFormValues } from '../schema/scheduleForm'
import { PatientSelectList } from './PatientSelectList'
import { ScheduleCategoryCheckboxGroup } from './ScheduleCategoryCheckboxGroup'
import { ScheduleDateTimeEdit } from './ScheduleDateTimeEdit'
import { ScheduleFieldSummaryList, type ScheduleFieldSummaryItem } from './ScheduleFieldSummaryList'
import { StaffSelectList } from './StaffSelectList'

type FieldId = 'title' | 'dateTime' | 'patient' | 'staff' | 'category' | 'description'

const UNSELECTED = '未選択'

export type ScheduleFormProps = {
  /** 送信のボタンをフォームの外（モーダルの下端）に置くため、form 要素の id を受け取る。 */
  id: string
  form: UseFormReturn<ScheduleFormValues>
  staffList: Staff[]
  patients: Patient[]
  onSubmit: (values: ScheduleFormValues) => void | Promise<void>
}

/**
 * 予定の作成と編集のフォーム。左に項目の要約を並べ、右に選んだ項目の編集の欄を出す。
 * 通常と訪問の切り替えは持たず、form の kind の値に従う。
 */
export const ScheduleForm = ({ id, form, staffList, patients, onSubmit }: ScheduleFormProps) => {
  const [activeField, setActiveField] = useState<FieldId>('dateTime')
  const { control, formState, handleSubmit } = form
  const values = useWatch({ control }) as Partial<ScheduleFormValues>
  const errors = formState.errors as Partial<Record<string, { message?: string }>>
  const isVisit = values.kind === 'visit'

  const staffName = staffList.find((staff) => staff.id === values.staffId)?.name ?? UNSELECTED
  const patientId = isVisit ? (values as { patientId?: string }).patientId : undefined
  const patientName = patients.find((patient) => patient.id === patientId)?.name ?? UNSELECTED

  const dateTimeSummary = (() => {
    if (values.kind === 'visit') {
      const end =
        values.startTime !== undefined && values.serviceTime !== undefined
          ? visitEndTime(values.startTime, values.serviceTime)
          : '-'
      return `${values.scheduleDate ?? ''} ${values.startTime ?? ''} - ${end}（${values.serviceTime ?? '-'} 分、${values.serviceCode ?? ''}）`
    }
    return `${values.scheduleDate ?? ''} ${values.startTime ?? ''} - ${values.kind === 'normal' ? (values.endTime ?? '') : ''}`
  })()

  const items: ScheduleFieldSummaryItem<FieldId>[] = [
    ...(isVisit
      ? []
      : [
          {
            id: 'title' as const,
            label: 'タイトル',
            content: values.kind === 'normal' && values.title ? values.title : 'タイトル',
            error: errors.title?.message,
          },
        ]),
    {
      id: 'dateTime',
      label: isVisit ? '訪問日時' : '予定日時',
      content: dateTimeSummary,
      error:
        errors.scheduleDate?.message ??
        errors.startTime?.message ??
        errors.endTime?.message ??
        errors.serviceTime?.message,
    },
    ...(isVisit
      ? [
          {
            id: 'patient' as const,
            label: '利用者',
            content: patientName,
            error: errors.patientId?.message,
          },
        ]
      : []),
    {
      id: 'staff',
      label: isVisit ? '担当者' : '予定者',
      content: staffName,
      error: errors.staffId?.message,
    },
    ...(isVisit
      ? [
          {
            id: 'category' as const,
            label: '訪問の種類',
            content:
              values.kind === 'visit' &&
              values.categories !== undefined &&
              values.categories.length > 0
                ? values.categories.map((category) => SCHEDULE_CATEGORY_LABEL[category]).join('、')
                : '通常',
          },
        ]
      : []),
    { id: 'description', label: 'メモ', content: values.description || 'なし' },
  ]

  const visibleField = items.some((item) => item.id === activeField) ? activeField : 'dateTime'

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
          <TextareaField control={control} label="タイトル" name="title" />
        )}
        {visibleField === 'dateTime' && <ScheduleDateTimeEdit form={form} />}
        {visibleField === 'patient' && (
          <Controller
            control={control}
            name="patientId"
            render={({ field }) => (
              <PatientSelectList
                onChange={field.onChange}
                patients={patients}
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
                onChange={field.onChange}
                staffList={staffList}
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
          <TextareaField control={control} label="メモ" name="description" />
        )}
      </div>
    </form>
  )
}
