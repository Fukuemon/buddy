import { z } from 'zod'

import type { RecurringRule } from '#/api/types'

/** 毎月の繰り返しを、日にちで決めるか（day）、第何週の曜日で決めるか（weekday）。 */
export type MonthlyBy = 'day' | 'weekday'

/**
 * 繰り返しの欄（RecurringRuleFields）の値。頻度と決め方で使わない欄の値も持ち、切り替えても入れた値を残す。
 * 予定の作成と予定の編集の両方で、フォームの値の `recurrence` に置く。
 */
export type RecurringRuleFormValues = {
  frequency: RecurringRule['frequency']
  /** 毎月の第何週の曜日の曜日。1 が月曜、7 が日曜。 */
  dayOfWeek: number
  /** 毎週の曜日の集まり。1 が月曜、7 が日曜。欄は月曜から日曜の順に持ち、送るときも重なりを除いて同じ順に並べる。 */
  weeklyDays: number[]
  /** 毎週の間隔の週の数。1 が毎週、2 が隔週。欄を空にすると NaN になる。 */
  interval: number
  monthlyBy: MonthlyBy
  dayOfMonth: number
  weekOfMonth: number
  hasEndDate: boolean
  /** YYYY-MM-DD。hasEndDate が false のときは送らない。 */
  endDate: string
}

/** 繰り返しの欄を置くフォームの値の形。 */
export type RecurringRuleFormShape = { recurrence: RecurringRuleFormValues }

const dayOf = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`))

/** YYYY-MM-DD の曜日。1 が月曜、7 が日曜。 */
export const isoWeekdayOf = (date: string) => dayOf(date).getUTCDay() || 7

/** YYYY-MM-DD の、月の 1 日から 7 日ずつ区切った第何週か。 */
export const weekOfMonthOf = (date: string) => Math.floor((dayOf(date).getUTCDate() - 1) / 7) + 1

/**
 * 規則 rule を、繰り返しの欄の値にする。rule が持たない曜日、日、週は baseDate（YYYY-MM-DD）から決める。
 * 予定の API が、規則の空の項目を最初の日付から決めるのと同じである。baseDate には、最初の日付か、その規則の回の日を渡す。
 * rule を省くと、baseDate の曜日の毎週の、終了日の無い繰り返しにする。
 */
export const toRecurringRuleFormValues = (
  rule: RecurringRule | undefined,
  baseDate: string,
): RecurringRuleFormValues => ({
  frequency: rule?.frequency ?? 'weekly',
  dayOfWeek: (rule?.frequency === 'monthly' ? rule.dayOfWeek : null) ?? isoWeekdayOf(baseDate),
  weeklyDays:
    rule?.frequency === 'weekly' && rule.daysOfWeek?.length
      ? rule.daysOfWeek
      : [isoWeekdayOf(baseDate)],
  interval: rule?.frequency === 'weekly' ? (rule.interval ?? 1) : 1,
  monthlyBy: rule?.frequency === 'monthly' && rule.weekOfMonth !== null ? 'weekday' : 'day',
  dayOfMonth: rule?.dayOfMonth ?? dayOf(baseDate).getUTCDate(),
  weekOfMonth: rule?.weekOfMonth ?? weekOfMonthOf(baseDate),
  hasEndDate: rule?.endDate != null,
  endDate: rule?.endDate ?? baseDate,
})

/** 毎週の繰り返しで送る曜日の並び。weeklyDays の重なりを除き、月曜から日曜の順に並べる。 */
export const weeklyDaysOf = (values: Pick<RecurringRuleFormValues, 'weeklyDays'>): number[] =>
  [...new Set(values.weeklyDays)].sort((a, b) => a - b)

/** 毎週の間隔として送れる値か。1〜52 の整数である（ADR-0038）。 */
export const isValidInterval = (interval: number) =>
  Number.isInteger(interval) && interval >= 1 && interval <= 52

/** 繰り返しの欄の値を、頻度と決め方で使う項目だけを持つ規則にする。 */
export const toRecurringRule = (values: RecurringRuleFormValues): RecurringRule => {
  const endDate = values.hasEndDate ? values.endDate : null
  if (values.frequency === 'weekly') {
    return {
      frequency: 'weekly',
      daysOfWeek: weeklyDaysOf(values),
      interval: values.interval,
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate,
    }
  }
  if (values.monthlyBy === 'day') {
    return {
      frequency: 'monthly',
      daysOfWeek: null,
      interval: null,
      dayOfWeek: null,
      dayOfMonth: values.dayOfMonth,
      weekOfMonth: null,
      endDate,
    }
  }
  return {
    frequency: 'monthly',
    daysOfWeek: null,
    interval: null,
    dayOfWeek: values.dayOfWeek,
    dayOfMonth: null,
    weekOfMonth: values.weekOfMonth,
    endDate,
  }
}

/** 2 つの値が、終了日のほかに同じ回を決めるか。 */
export const sameRepetition = (a: RecurringRuleFormValues, b: RecurringRuleFormValues) => {
  const x = toRecurringRule(a)
  const y = toRecurringRule(b)
  return (
    x.frequency === y.frequency &&
    String(x.daysOfWeek) === String(y.daysOfWeek) &&
    x.interval === y.interval &&
    x.dayOfWeek === y.dayOfWeek &&
    x.dayOfMonth === y.dayOfMonth &&
    x.weekOfMonth === y.weekOfMonth
  )
}

/** 繰り返しの欄の値の形と、終了日を決めたときの日付を検証する。画面ごとの規則は、使う側が足す。 */
export const recurringRuleFormSchema = z
  .object({
    frequency: z.enum(['weekly', 'monthly']),
    dayOfWeek: z.number().int().min(1).max(7),
    weeklyDays: z.array(z.number().int().min(1).max(7)),
    // 毎月では使わない欄なので、範囲は毎週のときだけ下で確認する。欄を空にした NaN も受ける
    interval: z.union([z.number(), z.nan()]),
    monthlyBy: z.enum(['day', 'weekday']),
    dayOfMonth: z.number().int().min(1).max(31),
    weekOfMonth: z.number().int().min(1).max(5),
    hasEndDate: z.boolean(),
    endDate: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.frequency === 'weekly' && values.weeklyDays.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['weeklyDays'],
        message: '曜日を 1 つ以上選んでください',
      })
    }
    if (values.frequency === 'weekly' && !isValidInterval(values.interval)) {
      ctx.addIssue({
        code: 'custom',
        path: ['interval'],
        message: '間隔は 1〜52 の週の数で入力してください',
      })
    }
    if (values.hasEndDate && !z.iso.date().safeParse(values.endDate).success) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: '終了日を入力してください' })
    }
  })
