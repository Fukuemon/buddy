import { useState } from 'react'
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'

import type { ScheduleCreateFormValues } from '../schema/scheduleCreateForm'
import { RecurringRuleFields } from './RecurringRuleFields'

export type ScheduleRecurrenceEditProps = {
  form: UseFormReturn<ScheduleCreateFormValues>
}

/**
 * 予定の作成の繰り返しの入力。「繰り返しの予定にする」を選んだときだけ、その下に繰り返しの欄を出す。
 * 繰り返しの欄の選択肢は、フォームの日付から作る。
 */
export const ScheduleRecurrenceEdit = ({ form }: ScheduleRecurrenceEditProps) => {
  const { control, formState, trigger } = form
  const repeats = useWatch({ control, name: 'repeats' })
  const scheduleDate = useWatch({ control, name: 'scheduleDate' })
  // 日付の欄を消しているあいだも選択肢の文を作れるよう、最後に読めた日付から作る
  const [baseDate, setBaseDate] = useState(scheduleDate)
  if (scheduleDate !== baseDate && z.iso.date().safeParse(scheduleDate).success) {
    setBaseDate(scheduleDate)
  }
  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="repeats"
        render={({ field }) => (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 self-start rounded-8 has-[:focus-visible]:focus-ring">
            <input
              checked={field.value}
              className="size-5"
              data-testid="schedule-form-repeats"
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) => {
                field.onChange(event.target.checked)
                // 繰り返しの誤りは、繰り返すときだけ出るので、送った後は選び直すたびに検証し直す
                if (formState.isSubmitted) void trigger()
              }}
              ref={field.ref}
              type="checkbox"
            />
            繰り返しの予定にする
          </label>
        )}
      />
      {repeats && <RecurringRuleFields baseDate={baseDate} form={form} />}
    </div>
  )
}
