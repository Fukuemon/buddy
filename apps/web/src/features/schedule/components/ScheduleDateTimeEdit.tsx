import { Controller, useWatch, type UseFormReturn } from 'react-hook-form'

import type { ServiceCodeRecord } from '#/api/types'
import { DatePicker, NumberPicker, TimePicker } from '@buddy/ui'

import { visitEndTimeOfInput } from '../lib/scheduleFormMapper'
import type { ScheduleFormValues } from '../schema/scheduleForm'
import { ServiceCodeRadioGroup } from './ServiceCodeRadioGroup'

export type ScheduleDateTimeEditProps = {
  form: UseFormReturn<ScheduleFormValues>
  /** 予定の API のサービスコードの一覧。この順に選択肢を並べる。 */
  serviceCodes: readonly ServiceCodeRecord[]
}

/**
 * 予定の日付と時間の入力。訪問の予定では、終了時間を開始時間と提供時間から求めて出し、
 * サービスコードを選ぶと提供時間をそのコードの上限にする。
 */
export const ScheduleDateTimeEdit = ({ form, serviceCodes }: ScheduleDateTimeEditProps) => {
  const { control, setValue } = form
  const kind = useWatch({ control, name: 'kind' })
  const startTime = useWatch({ control, name: 'startTime' })
  const serviceTime = useWatch({ control, name: 'serviceTime' }) as number | undefined
  const isVisit = kind === 'visit'

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-heading-sm">{isVisit ? '訪問日時' : '予定日時'}</h2>
      <div className="flex flex-col gap-4">
        <DatePicker
          control={control}
          data-testid="schedule-form-date"
          isWide
          label={isVisit ? '訪問日' : '日付'}
          name="scheduleDate"
        />
        <div className="flex gap-4">
          <TimePicker
            control={control}
            data-testid="schedule-form-start-time"
            isWide
            label="開始時間"
            name="startTime"
          />
          {isVisit && (
            <NumberPicker
              control={control}
              data-testid="schedule-form-service-time"
              isWide
              label="提供時間（分）"
              min={0}
              name="serviceTime"
            />
          )}
        </div>
        {isVisit ? (
          <p className="text-caption text-text-secondary" data-testid="schedule-form-end-time">
            終了時間 {visitEndTimeOfInput(startTime, serviceTime) ?? '-'}
          </p>
        ) : (
          <TimePicker
            control={control}
            data-testid="schedule-form-end-time"
            isWide
            label="終了時間"
            name="endTime"
          />
        )}
      </div>
      {isVisit && (
        <Controller
          control={control}
          name="serviceCode"
          render={({ field }) => (
            <ServiceCodeRadioGroup
              onChange={(code) => {
                field.onChange(code.code)
                setValue('serviceTime', code.service_time_range_end, { shouldValidate: true })
              }}
              serviceCodes={serviceCodes}
              value={field.value}
            />
          )}
        />
      )}
    </div>
  )
}
