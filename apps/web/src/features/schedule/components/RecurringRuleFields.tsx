import { clsx } from 'clsx'
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormReturn,
} from 'react-hook-form'

import { DatePicker, FormField, SegmentedControl, Select } from '@buddy/ui'

import type { MonthlyBy, RecurringRuleFormShape } from '../schema/recurringRuleForm'

const FREQUENCY_OPTIONS = [
  { id: 'weekly', label: '毎週' },
  { id: 'monthly', label: '毎月' },
] as const

const MONTHLY_BY_OPTIONS = [
  { id: 'day', label: '日にち' },
  { id: 'weekday', label: '第何週の曜日' },
] as const satisfies readonly { id: MonthlyBy; label: string }[]

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const WEEKS = [1, 2, 3, 4, 5] as const

export type RecurringRuleFieldsProps<T extends RecurringRuleFormShape> = {
  /** フォームの値の `recurrence` に、繰り返しの欄の値（RecurringRuleFormValues）を持つフォーム。 */
  form: UseFormReturn<T>
}

/**
 * 繰り返しの欄。頻度（毎週、毎月）、毎週の曜日、毎月の日にちか第何週の曜日、終了日を入れる。
 * 予定の編集の「この日以降の全ての回」と、予定の作成の繰り返しで使う。値の検証は、使う側の resolver が行う。
 * 頻度や決め方を替えても、ほかの欄の値は残す。終了日は「終了日を決める」を選んでいるときだけ出す。
 * testid は `recurring-rule-` で始める。
 */
export const RecurringRuleFields = <T extends RecurringRuleFormShape>({
  form,
}: RecurringRuleFieldsProps<T>) => {
  // 使う側のフォームの値の型は `recurrence` のほかの欄も持つので、この欄が読み書きする `recurrence` の形だけに絞る
  const control = form.control as unknown as Control<RecurringRuleFormShape>
  const errors = (form.formState.errors as FieldErrors<RecurringRuleFormShape>).recurrence
  const recurrence = useWatch({ control, name: 'recurrence' })

  return (
    <div className="flex flex-col gap-6">
      <Controller
        control={control}
        name="recurrence.frequency"
        render={({ field }) => (
          <FormField error={errors?.frequency?.message} isGroup label="繰り返し">
            {(props) => (
              <div className="max-w-80" {...props}>
                <SegmentedControl
                  data-testid="recurring-rule-frequency"
                  label="繰り返し"
                  onChange={field.onChange}
                  options={FREQUENCY_OPTIONS}
                  value={field.value}
                />
              </div>
            )}
          </FormField>
        )}
      />
      {recurrence.frequency === 'weekly' ? (
        <Controller
          control={control}
          name="recurrence.dayOfWeek"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-label">曜日</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, i) => {
                  const day = i + 1
                  const checked = field.value === day
                  return (
                    <label
                      className={clsx(
                        'relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-8 px-3 text-body-dense ring-1 ring-inset has-[:focus-visible]:focus-ring',
                        checked
                          ? 'bg-primary-surface font-bold text-primary ring-2 ring-primary'
                          : 'ring-border-field',
                      )}
                      key={day}
                    >
                      {/* sr-only だと label がクリックを受け、Playwright が radio を押せない。選択肢の全面に透明で重ねる */}
                      <input
                        checked={checked}
                        className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
                        data-testid={`recurring-rule-day-of-week-${day}`}
                        name={field.name}
                        onChange={() => field.onChange(day)}
                        type="radio"
                        value={day}
                      />
                      {label}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}
        />
      ) : (
        <>
          <Controller
            control={control}
            name="recurrence.monthlyBy"
            render={({ field }) => (
              <FormField isGroup label="毎月の決め方">
                {(props) => (
                  <div className="max-w-80" {...props}>
                    <SegmentedControl
                      data-testid="recurring-rule-monthly-by"
                      label="毎月の決め方"
                      onChange={field.onChange}
                      options={MONTHLY_BY_OPTIONS}
                      value={field.value}
                    />
                  </div>
                )}
              </FormField>
            )}
          />
          {recurrence.monthlyBy === 'day' ? (
            <Controller
              control={control}
              name="recurrence.dayOfMonth"
              render={({ field }) => (
                <div className="max-w-40">
                  <FormField label="日にち">
                    {(props) => (
                      <Select
                        {...props}
                        data-testid="recurring-rule-day-of-month"
                        name={field.name}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                        value={field.value}
                      >
                        {DAYS.map((day) => (
                          <option key={day} value={day}>
                            {day} 日
                          </option>
                        ))}
                      </Select>
                    )}
                  </FormField>
                </div>
              )}
            />
          ) : (
            <div className="flex max-w-80 gap-4">
              <Controller
                control={control}
                name="recurrence.weekOfMonth"
                render={({ field }) => (
                  <FormField label="週">
                    {(props) => (
                      <Select
                        {...props}
                        data-testid="recurring-rule-week-of-month"
                        name={field.name}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                        value={field.value}
                      >
                        {WEEKS.map((week) => (
                          <option key={week} value={week}>
                            第 {week}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="recurrence.dayOfWeek"
                render={({ field }) => (
                  <FormField label="曜日">
                    {(props) => (
                      <Select
                        {...props}
                        data-testid="recurring-rule-monthly-day-of-week"
                        name={field.name}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                        value={field.value}
                      >
                        {WEEKDAYS.map((label, i) => (
                          <option key={label} value={i + 1}>
                            {label}曜
                          </option>
                        ))}
                      </Select>
                    )}
                  </FormField>
                )}
              />
            </div>
          )}
        </>
      )}
      <div className="flex flex-col gap-4">
        <Controller
          control={control}
          name="recurrence.hasEndDate"
          render={({ field }) => (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 self-start rounded-8 has-[:focus-visible]:focus-ring">
              <input
                checked={field.value}
                className="size-5"
                data-testid="recurring-rule-has-end-date"
                name={field.name}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(event.target.checked)}
                ref={field.ref}
                type="checkbox"
              />
              終了日を決める
            </label>
          )}
        />
        {recurrence.hasEndDate && (
          <div className="max-w-60">
            <DatePicker
              control={control}
              data-testid="recurring-rule-end-date"
              isWide
              label="終了日"
              name="recurrence.endDate"
            />
          </div>
        )}
      </div>
    </div>
  )
}
