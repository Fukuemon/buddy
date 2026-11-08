import { z } from 'zod'

import type { RecurringRule, ServiceCodeRecord } from '#/api/types'

import {
  isoWeekdayOf,
  recurringRuleFormSchema,
  toRecurringRule,
  weekOfMonthOf,
  type RecurringRuleFormValues,
} from './recurringRuleForm'
import { createScheduleFormSchema, type ScheduleFormValues } from './scheduleForm'

/** 予定の作成のフォームの値。予定のフォームの値に、繰り返すかと繰り返しの欄の値を足す。 */
export type ScheduleCreateFormValues = ScheduleFormValues & {
  /** true なら、scheduleDate を最初の日付にして recurrence の規則で繰り返す予定を作る。 */
  repeats: boolean
  recurrence: RecurringRuleFormValues
}

export const RECURRENCE_NOT_OCCURRING_MESSAGE =
  '日付が繰り返しの回に当たりません。日付か繰り返しを変えてください'

/** 規則 rule の繰り返しの予定を date（YYYY-MM-DD）から始めたとき、date が最初の回になるか。予定の API は、ならない規則を 400 で拒む。 */
export const startsOn = (rule: RecurringRule, date: string) => {
  const weekday = isoWeekdayOf(date)
  if (rule.frequency === 'weekly') return rule.daysOfWeek?.includes(weekday) ?? true
  if (rule.dayOfMonth !== null) return Number(date.slice(8, 10)) === rule.dayOfMonth
  if (rule.weekOfMonth !== null) {
    return weekOfMonthOf(date) === rule.weekOfMonth && (rule.dayOfWeek ?? weekday) === weekday
  }
  return true
}

/**
 * 日付を from から to に変えたときの繰り返しの欄の値。from から作る選択肢（毎週の曜日、毎月の日、毎月の第何週の曜日）と同じ規則なら、
 * to から作る同じ選択肢にする。カスタムで選んだ別の規則は変えない。
 */
export const followScheduleDate = (
  values: RecurringRuleFormValues,
  from: string,
  to: string,
): RecurringRuleFormValues => {
  const repetition = followRepetition(values, from, to)
  // 終了日を「なし」にしている間は、「あり」にしたときの初期の日を、新しい日付にそろえる
  return repetition.hasEndDate ? repetition : { ...repetition, endDate: to }
}

const followRepetition = (
  values: RecurringRuleFormValues,
  from: string,
  to: string,
): RecurringRuleFormValues => {
  const rule = toRecurringRule(values)
  if (rule.frequency === 'weekly') {
    if (String(rule.daysOfWeek) !== String([isoWeekdayOf(from)])) return values
    return { ...values, weeklyDays: [isoWeekdayOf(to)] }
  }
  if (rule.dayOfMonth !== null) {
    if (rule.dayOfMonth !== Number(from.slice(8, 10))) return values
    return { ...values, dayOfMonth: Number(to.slice(8, 10)) }
  }
  if (rule.dayOfWeek !== isoWeekdayOf(from) || rule.weekOfMonth !== weekOfMonthOf(from)) {
    return values
  }
  return { ...values, dayOfWeek: isoWeekdayOf(to), weekOfMonth: weekOfMonthOf(to) }
}

/**
 * 予定の作成のフォームの検証。予定のフォームの検証に、繰り返すときだけ、繰り返しの欄の検証と、
 * 日付が規則の回に当たること、終了日が日付以降であることの確認を足す。
 */
export const createScheduleCreateFormSchema = (serviceCodes: readonly ServiceCodeRecord[]) =>
  createScheduleFormSchema(serviceCodes)
    .and(z.object({ repeats: z.boolean(), recurrence: z.custom<RecurringRuleFormValues>() }))
    .superRefine((values, ctx) => {
      if (!values.repeats) return
      const parsed = recurringRuleFormSchema.safeParse(values.recurrence)
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: ['recurrence', ...issue.path],
            message: issue.message,
          })
        }
        return
      }
      if (!startsOn(toRecurringRule(values.recurrence), values.scheduleDate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'frequency'],
          message: RECURRENCE_NOT_OCCURRING_MESSAGE,
        })
      }
      if (values.recurrence.hasEndDate && values.recurrence.endDate < values.scheduleDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'endDate'],
          message: '終了日は日付以降にしてください',
        })
      }
    })
