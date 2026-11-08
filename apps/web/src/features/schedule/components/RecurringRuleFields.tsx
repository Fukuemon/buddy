import { clsx } from 'clsx'
import { useId, useState, type ReactNode } from 'react'
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormReturn,
} from 'react-hook-form'

import { DatePicker, Select, fieldControlClassName } from '@buddy/ui'

import {
  isoWeekdayOf,
  isValidInterval,
  weekOfMonthOf,
  weeklyDaysOf,
  weeklyIntervalLabel,
  type RecurringRuleFormShape,
  type RecurringRuleFormValues,
} from '../schema/recurringRuleForm'

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const WEEKS = [1, 2, 3, 4, 5] as const

/**
 * 繰り返しの選択肢。current は、開いた規則が複数の曜日の毎週のときだけ置き、元の曜日の並びのまま送る。
 * custom と current のほかは、baseDate の曜日、日、第何週から作る。
 */
type Preset = 'current' | 'weekly' | 'monthly-day' | 'monthly-weekday' | 'custom'

/** 選択肢が決める欄の値。毎月の選択肢は毎週の曜日を持たず、選んでも曜日の欄の値を残す。 */
type Repetition = Pick<
  RecurringRuleFormValues,
  'frequency' | 'dayOfWeek' | 'monthlyBy' | 'dayOfMonth' | 'weekOfMonth'
> & { weeklyDays?: number[] }

const weekdayLabel = (day: number) => `${WEEKDAYS[day - 1]}曜日`

type Presets = Record<'weekly' | 'monthly-day' | 'monthly-weekday', Repetition> & {
  current?: Repetition
}

/**
 * baseDate（YYYY-MM-DD）と、開いた規則の毎週の曜日の並び originalDays から、選択肢ごとの繰り返しを作る。
 * originalDays が 2 つ以上の曜日を持つときだけ、current を作る。
 */
const presetsOf = (baseDate: string, originalDays: number[]): Presets => {
  const dayOfWeek = isoWeekdayOf(baseDate)
  const dayOfMonth = Number(baseDate.slice(8, 10))
  const weekOfMonth = weekOfMonthOf(baseDate)
  const presets: Presets = {
    weekly: {
      frequency: 'weekly',
      dayOfWeek,
      weeklyDays: [dayOfWeek],
      monthlyBy: 'day',
      dayOfMonth,
      weekOfMonth,
    },
    'monthly-day': {
      frequency: 'monthly',
      dayOfWeek,
      monthlyBy: 'day',
      dayOfMonth,
      weekOfMonth,
    },
    'monthly-weekday': {
      frequency: 'monthly',
      dayOfWeek,
      monthlyBy: 'weekday',
      dayOfMonth,
      weekOfMonth,
    },
  }
  if (originalDays.length < 2) return presets
  return {
    current: {
      frequency: 'weekly',
      dayOfWeek,
      weeklyDays: originalDays,
      monthlyBy: 'day',
      dayOfMonth,
      weekOfMonth,
    },
    ...presets,
  }
}

/** 選択肢の文言。毎週の選択肢は、送る間隔 interval を「毎週」「隔週」「3 週ごと」の形で前に付ける。 */
const presetLabel = (preset: Exclude<Preset, 'custom'>, r: Repetition, interval: number) => {
  if (preset === 'current') {
    return `${weeklyIntervalLabel(interval)} ${(r.weeklyDays ?? []).map(weekdayLabel).join('、')}`
  }
  if (preset === 'weekly') return `${weeklyIntervalLabel(interval)} ${weekdayLabel(r.dayOfWeek)}`
  if (preset === 'monthly-day') return `毎月 ${r.dayOfMonth} 日`
  return `毎月 第 ${r.weekOfMonth} ${weekdayLabel(r.dayOfWeek)}`
}

/** 値が、どの選択肢と同じ回を決めるか。毎週は、送る曜日の並びで比べる。どれとも違えば custom である。 */
const matchPreset = (values: RecurringRuleFormValues, presets: Presets): Preset => {
  if (values.frequency === 'weekly') {
    const days = String(weeklyDaysOf(values))
    if (presets.current !== undefined && days === String(presets.current.weeklyDays)) {
      return 'current'
    }
    return days === String(presets.weekly.weeklyDays) ? 'weekly' : 'custom'
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
      <span
        className="text-label desktop:flex desktop:min-h-11 desktop:items-center desktop:self-start"
        id={labelId}
      >
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
 * 繰り返しの欄。繰り返しを、baseDate から作った 3 つの選択肢か「カスタム…」から選び、終了日を「なし」か「あり」から選び、「あり」の右の日付の欄で終了日を入れる。
 * 開いた規則が複数の曜日の毎週のときは、先頭に今の規則の選択肢（「隔週 月曜日、木曜日」の形）を足す。
 * 毎週の選択肢と「繰り返す」の毎週は、間隔の値を「隔週」「3 週ごと」の形で出し、曜日を変えてもその間隔で送る（ADR-0038）。
 * 「カスタム…」を選ぶと、同じ欄の中に、繰り返す（毎週、毎月）と、毎週では間隔（1〜52 の週の数）と曜日（1 つ以上）の欄を、毎月では日の欄を開く。
 * 値がどの選択肢とも違うときも、開いた形で始める。
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
  // 今の規則の選択肢は、開いたときの曜日の並びで作る。選択肢を選ぶと weeklyDays が替わるので、開いたときの値を残す
  const [originalDays] = useState(() => own.getValues('recurrence.weeklyDays'))
  const [originalInterval] = useState(() => own.getValues('recurrence.interval'))
  const presets = presetsOf(baseDate, originalDays)
  const [isCustom, setCustom] = useState(
    () => matchPreset(own.getValues('recurrence'), presets) === 'custom',
  )
  const preset: Preset = isCustom ? 'custom' : matchPreset(recurrence, presets)
  const id = useId()
  const dayOfWeekLabelId = `${id}-day-of-week`
  const monthlyLabelId = `${id}-monthly`
  const endsLabelId = `${id}-ends`

  const choosePreset = (next: Preset) => {
    if (next === 'custom') {
      setCustom(true)
      return
    }
    const repetition = presets[next]
    if (repetition === undefined) return
    setCustom(false)
    for (const [key, value] of Object.entries(repetition)) {
      own.setValue(`recurrence.${key as keyof Repetition}`, value, { shouldDirty: true })
    }
    // 毎週の選択肢を選ぶと間隔の欄が閉じるので、範囲の外の間隔を開いたときの間隔に戻し、見えない誤りで保存を止めない
    if (
      repetition.frequency === 'weekly' &&
      !isValidInterval(own.getValues('recurrence.interval'))
    ) {
      own.setValue(
        'recurrence.interval',
        isValidInterval(originalInterval) ? originalInterval : 1,
        {
          shouldDirty: true,
        },
      )
      own.clearErrors('recurrence.interval')
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
            {(['current', 'weekly', 'monthly-day', 'monthly-weekday'] as const).map((key) => {
              const repetition = presets[key]
              return repetition === undefined ? null : (
                <option key={key} value={key}>
                  {presetLabel(key, repetition, recurrence.interval)}
                </option>
              )
            })}
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
                <div className="w-36">
                  <Select
                    data-testid="recurring-rule-frequency"
                    id={`${id}-frequency`}
                    name={field.name}
                    onChange={(event) => field.onChange(event.target.value)}
                    value={field.value}
                  >
                    <option value="weekly">{weeklyIntervalLabel(recurrence.interval)}</option>
                    <option value="monthly">毎月</option>
                  </Select>
                </div>
              )}
            />
          </Row>
          {recurrence.frequency === 'weekly' ? (
            <>
              <Row htmlFor={`${id}-interval`} label="間隔">
                <Controller
                  control={control}
                  name="recurrence.interval"
                  render={({ field, fieldState }) => (
                    <div className="flex flex-col gap-1">
                      {/* 誤りの文を欄の幅で折り返さず、「週ごと」の下まで使って出すため、NumberPicker の枠を使わない */}
                      <div className="flex items-center gap-3">
                        <input
                          aria-describedby={
                            fieldState.error === undefined ? undefined : `${id}-interval-error`
                          }
                          aria-invalid={fieldState.error === undefined ? undefined : true}
                          className={clsx(fieldControlClassName, 'h-11 w-24 px-4 text-body')}
                          data-testid="recurring-rule-interval"
                          id={`${id}-interval`}
                          max={52}
                          min={1}
                          name={field.name}
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(event.target.valueAsNumber)}
                          ref={field.ref}
                          type="number"
                          value={Number.isNaN(field.value) ? '' : field.value}
                        />
                        <span>週ごと</span>
                      </div>
                      {fieldState.error?.message !== undefined && (
                        <span className="text-caption text-danger" id={`${id}-interval-error`}>
                          {fieldState.error.message}
                        </span>
                      )}
                    </div>
                  )}
                />
              </Row>
              <Row label="曜日" labelId={dayOfWeekLabelId}>
                <Controller
                  control={control}
                  name="recurrence.weeklyDays"
                  render={({ field, fieldState }) => (
                    <div className="flex flex-col gap-1">
                      <fieldset
                        aria-describedby={
                          fieldState.error === undefined ? undefined : `${id}-days-error`
                        }
                        aria-labelledby={dayOfWeekLabelId}
                        className="flex gap-1 desktop:gap-2"
                      >
                        {WEEKDAYS.map((label, i) => {
                          const day = i + 1
                          const checked = field.value.includes(day)
                          return (
                            <label
                              className={clsx(
                                'relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-body has-[:focus-visible]:focus-ring',
                                checked
                                  ? 'bg-primary font-bold text-text-inverse'
                                  : fieldState.error === undefined
                                    ? 'ring-1 ring-border-field ring-inset'
                                    : 'ring-2 ring-danger ring-inset',
                              )}
                              key={day}
                            >
                              {/* sr-only だと label がクリックを受け、Playwright が checkbox を押せない。選択肢の全面に透明で重ねる */}
                              <input
                                aria-label={weekdayLabel(day)}
                                checked={checked}
                                className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
                                data-testid={`recurring-rule-day-of-week-${day}`}
                                name={field.name}
                                onChange={() =>
                                  field.onChange(
                                    checked
                                      ? field.value.filter((d) => d !== day)
                                      : [...field.value, day].sort((a, b) => a - b),
                                  )
                                }
                                type="checkbox"
                                value={day}
                              />
                              {label}
                            </label>
                          )
                        })}
                      </fieldset>
                      {fieldState.error?.message !== undefined && (
                        <span className="text-caption text-danger" id={`${id}-days-error`}>
                          {fieldState.error.message}
                        </span>
                      )}
                    </div>
                  )}
                />
              </Row>
            </>
          ) : (
            <Row label="日" labelId={monthlyLabelId}>
              <Controller
                control={control}
                name="recurrence.monthlyBy"
                render={({ field: by }) => (
                  <div
                    aria-labelledby={monthlyLabelId}
                    className="flex flex-col gap-2"
                    role="radiogroup"
                  >
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
      <Row label="終了日" labelId={endsLabelId}>
        <Controller
          control={control}
          name="recurrence.hasEndDate"
          render={({ field }) => (
            <div
              aria-labelledby={endsLabelId}
              className="grid grid-cols-[max-content_minmax(0,12.5rem)] items-start gap-x-4 gap-y-2"
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
                あり
              </label>
              <DatePicker
                control={control}
                data-testid="recurring-rule-end-date"
                disabled={!field.value}
                isLabelHidden
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
