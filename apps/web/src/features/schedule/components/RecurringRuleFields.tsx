import { clsx } from 'clsx'
import { useId, useState, type ReactNode } from 'react'
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormReturn,
} from 'react-hook-form'

import { DatePicker, Select } from '@buddy/ui'

import {
  isoWeekdayOf,
  weekOfMonthOf,
  type RecurringRuleFormShape,
  type RecurringRuleFormValues,
} from '../schema/recurringRuleForm'

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const WEEKS = [1, 2, 3, 4, 5] as const

/** 繰り返しの選択肢。custom のほかは、baseDate の曜日、日、第何週から作る。 */
type Preset = 'weekly' | 'monthly-day' | 'monthly-weekday' | 'custom'

type Repetition = Pick<
  RecurringRuleFormValues,
  'frequency' | 'dayOfWeek' | 'monthlyBy' | 'dayOfMonth' | 'weekOfMonth'
>

const weekdayLabel = (day: number) => `${WEEKDAYS[day - 1]}曜日`

/** baseDate（YYYY-MM-DD）から、選択肢ごとの繰り返しを作る。 */
const presetsOf = (baseDate: string): Record<Exclude<Preset, 'custom'>, Repetition> => {
  const dayOfWeek = isoWeekdayOf(baseDate)
  const dayOfMonth = Number(baseDate.slice(8, 10))
  const weekOfMonth = weekOfMonthOf(baseDate)
  return {
    weekly: { frequency: 'weekly', dayOfWeek, monthlyBy: 'day', dayOfMonth, weekOfMonth },
    'monthly-day': { frequency: 'monthly', dayOfWeek, monthlyBy: 'day', dayOfMonth, weekOfMonth },
    'monthly-weekday': {
      frequency: 'monthly',
      dayOfWeek,
      monthlyBy: 'weekday',
      dayOfMonth,
      weekOfMonth,
    },
  }
}

const presetLabel = (preset: Exclude<Preset, 'custom'>, r: Repetition) => {
  if (preset === 'weekly') return `毎週 ${weekdayLabel(r.dayOfWeek)}`
  if (preset === 'monthly-day') return `毎月 ${r.dayOfMonth} 日`
  return `毎月 第 ${r.weekOfMonth} ${weekdayLabel(r.dayOfWeek)}`
}

/** 値が、どの選択肢と同じ回を決めるか。どれとも違えば custom である。 */
const matchPreset = (values: RecurringRuleFormValues, baseDate: string): Preset => {
  const presets = presetsOf(baseDate)
  if (values.frequency === 'weekly') {
    return values.dayOfWeek === presets.weekly.dayOfWeek ? 'weekly' : 'custom'
  }
  if (values.monthlyBy === 'day') {
    return values.dayOfMonth === presets['monthly-day'].dayOfMonth ? 'monthly-day' : 'custom'
  }
  return values.dayOfWeek === presets['monthly-weekday'].dayOfWeek &&
    values.weekOfMonth === presets['monthly-weekday'].weekOfMonth
    ? 'monthly-weekday'
    : 'custom'
}

/** 見出しを左、欄を右に置く 1 行。幅 768px 未満では見出しを欄の上に置く。 */
const Row = ({
  label,
  htmlFor,
  labelId,
  children,
}: {
  label: string
  htmlFor?: string
  labelId?: string
  children: ReactNode
}) => (
  <>
    {htmlFor === undefined ? (
      <span className="text-label desktop:flex desktop:min-h-11 desktop:items-center desktop:self-start" id={labelId}>
        {label}
      </span>
    ) : (
      <label
        className="text-label desktop:flex desktop:min-h-11 desktop:items-center desktop:self-start"
        htmlFor={htmlFor}
        id={labelId}
      >
        {label}
      </label>
    )}
    <div className="mb-3 min-w-0 desktop:mb-0">{children}</div>
  </>
)

const radioClassName =
  'flex min-h-11 cursor-pointer items-center gap-3 self-start rounded-8 has-[:focus-visible]:focus-ring'

export type RecurringRuleFieldsProps<T extends RecurringRuleFormShape> = {
  /** フォームの値の `recurrence` に、繰り返しの欄の値（RecurringRuleFormValues）を持つフォーム。 */
  form: UseFormReturn<T>
  /** 選択肢の「毎週 月曜日」「毎月 16 日」「毎月 第 3 月曜日」を作る日（YYYY-MM-DD）。予定の編集では開いた回の日、作成では最初の日付を渡す。 */
  baseDate: string
}

/**
 * 繰り返しの欄。繰り返しを、baseDate から作った 3 つの選択肢か「カスタム…」から選び、終了を「なし」か「終了日」から選ぶ。
 * 「カスタム…」を選ぶと、同じ欄の中に、繰り返す（毎週、毎月）と、曜日か毎月の日の欄を開く。値が 3 つの選択肢のどれとも違うときも、開いた形で始める。
 * 予定の編集の「繰り返しを変更」と、予定の作成の繰り返しで使う。値の検証は、使う側の resolver が行う。
 * 選択肢や頻度を替えても、使わない欄の値は残す。testid は `recurring-rule-` で始める。
 */
export const RecurringRuleFields = <T extends RecurringRuleFormShape>({
  form,
  baseDate,
}: RecurringRuleFieldsProps<T>) => {
  // 使う側のフォームの値の型は `recurrence` のほかの欄も持つので、この欄が読み書きする `recurrence` の形だけに絞る
  const own = form as unknown as UseFormReturn<RecurringRuleFormShape>
  const control = own.control as Control<RecurringRuleFormShape>
  const errors = (form.formState.errors as FieldErrors<RecurringRuleFormShape>).recurrence
  const recurrence = useWatch({ control, name: 'recurrence' })
  const [isCustom, setCustom] = useState(
    () => matchPreset(own.getValues('recurrence'), baseDate) === 'custom',
  )
  const presets = presetsOf(baseDate)
  const preset: Preset = isCustom ? 'custom' : matchPreset(recurrence, baseDate)
  const id = useId()
  const dayOfWeekLabelId = `${id}-day-of-week`
  const monthlyLabelId = `${id}-monthly`
  const endsLabelId = `${id}-ends`

  const choosePreset = (next: Preset) => {
    if (next === 'custom') {
      setCustom(true)
      return
    }
    setCustom(false)
    for (const [key, value] of Object.entries(presets[next])) {
      own.setValue(`recurrence.${key as keyof Repetition}`, value, { shouldDirty: true })
    }
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 desktop:grid-cols-[7rem_minmax(0,1fr)] desktop:gap-y-6">
      <Row htmlFor={`${id}-preset`} label="繰り返し">
        <div className="flex flex-col gap-1 desktop:w-70">
          <Select
            aria-describedby={errors?.frequency === undefined ? undefined : `${id}-preset-error`}
            aria-invalid={errors?.frequency === undefined ? undefined : true}
            data-testid="recurring-rule-preset"
            id={`${id}-preset`}
            onChange={(event) => choosePreset(event.target.value as Preset)}
            value={preset}
          >
            {(['weekly', 'monthly-day', 'monthly-weekday'] as const).map((key) => (
              <option key={key} value={key}>
                {presetLabel(key, presets[key])}
              </option>
            ))}
            <option value="custom">カスタム…</option>
          </Select>
          {errors?.frequency?.message !== undefined && (
            <span className="text-caption text-danger" id={`${id}-preset-error`}>
              {errors.frequency.message}
            </span>
          )}
        </div>
      </Row>
      {preset === 'custom' && (
        <>
          <Row htmlFor={`${id}-frequency`} label="繰り返す">
            <Controller
              control={control}
              name="recurrence.frequency"
              render={({ field }) => (
                <div className="w-28">
                  <Select
                    data-testid="recurring-rule-frequency"
                    id={`${id}-frequency`}
                    name={field.name}
                    onChange={(event) => field.onChange(event.target.value)}
                    value={field.value}
                  >
                    <option value="weekly">毎週</option>
                    <option value="monthly">毎月</option>
                  </Select>
                </div>
              )}
            />
          </Row>
          {recurrence.frequency === 'weekly' ? (
            <Row label="曜日" labelId={dayOfWeekLabelId}>
              <Controller
                control={control}
                name="recurrence.dayOfWeek"
                render={({ field }) => (
                  <div
                    aria-labelledby={dayOfWeekLabelId}
                    className="flex gap-1 desktop:gap-2"
                    role="radiogroup"
                  >
                    {WEEKDAYS.map((label, i) => {
                      const day = i + 1
                      const checked = field.value === day
                      return (
                        <label
                          className={clsx(
                            'relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-body has-[:focus-visible]:focus-ring',
                            checked
                              ? 'bg-primary font-bold text-text-inverse'
                              : 'ring-1 ring-border-field ring-inset',
                          )}
                          key={day}
                        >
                          {/* sr-only だと label がクリックを受け、Playwright が radio を押せない。選択肢の全面に透明で重ねる */}
                          <input
                            aria-label={weekdayLabel(day)}
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
                )}
              />
            </Row>
          ) : (
            <Row label="日" labelId={monthlyLabelId}>
              <Controller
                control={control}
                name="recurrence.monthlyBy"
                render={({ field: by }) => (
                  <div aria-labelledby={monthlyLabelId} className="flex flex-col gap-2" role="radiogroup">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={radioClassName}>
                        <input
                          checked={by.value === 'day'}
                          className="size-5"
                          data-testid="recurring-rule-monthly-by-day"
                          name={by.name}
                          onChange={() => by.onChange('day')}
                          type="radio"
                        />
                        日にち
                      </label>
                      <Controller
                        control={control}
                        name="recurrence.dayOfMonth"
                        render={({ field }) => (
                          <Select
                            aria-label="日にち"
                            data-testid="recurring-rule-day-of-month"
                            disabled={by.value !== 'day'}
                            isWide={false}
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
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className={radioClassName}>
                        <input
                          checked={by.value === 'weekday'}
                          className="size-5"
                          data-testid="recurring-rule-monthly-by-weekday"
                          name={by.name}
                          onChange={() => by.onChange('weekday')}
                          type="radio"
                        />
                        曜日
                      </label>
                      <Controller
                        control={control}
                        name="recurrence.weekOfMonth"
                        render={({ field }) => (
                          <Select
                            aria-label="第何週"
                            data-testid="recurring-rule-week-of-month"
                            disabled={by.value !== 'weekday'}
                            isWide={false}
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
                      />
                      <Controller
                        control={control}
                        name="recurrence.dayOfWeek"
                        render={({ field }) => (
                          <Select
                            aria-label="曜日"
                            data-testid="recurring-rule-monthly-day-of-week"
                            disabled={by.value !== 'weekday'}
                            isWide={false}
                            name={field.name}
                            onChange={(event) => field.onChange(Number(event.target.value))}
                            value={field.value}
                          >
                            {WEEKDAYS.map((_, i) => (
                              <option key={i} value={i + 1}>
                                {weekdayLabel(i + 1)}
                              </option>
                            ))}
                          </Select>
                        )}
                      />
                    </div>
                  </div>
                )}
              />
            </Row>
          )}
        </>
      )}
      <Row label="終了" labelId={endsLabelId}>
        <Controller
          control={control}
          name="recurrence.hasEndDate"
          render={({ field }) => (
            <div
              aria-labelledby={endsLabelId}
              className="grid grid-cols-[max-content_minmax(0,12.5rem)] items-center gap-x-4 gap-y-2"
              role="radiogroup"
            >
              <label className={radioClassName}>
                <input
                  checked={!field.value}
                  className="size-5"
                  data-testid="recurring-rule-ends-never"
                  name={field.name}
                  onChange={() => field.onChange(false)}
                  type="radio"
                />
                なし
              </label>
              <span />
              <label className={radioClassName}>
                <input
                  checked={field.value}
                  className="size-5"
                  data-testid="recurring-rule-ends-on"
                  name={field.name}
                  onChange={() => field.onChange(true)}
                  type="radio"
                />
                終了日
              </label>
              <DatePicker
                control={control}
                data-testid="recurring-rule-end-date"
                disabled={!field.value}
                isWide
                label="終了日"
                name="recurrence.endDate"
              />
            </div>
          )}
        />
      </Row>
    </div>
  )
}
