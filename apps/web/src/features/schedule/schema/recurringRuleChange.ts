import { z } from 'zod'

import type { RecurringRule } from '#/api/types'

import {
  recurringRuleFormSchema,
  sameRepetition,
  toRecurringRule,
  type RecurringRuleFormShape,
  type RecurringRuleFormValues,
} from './recurringRuleForm'

const DAY_MS = 24 * 60 * 60 * 1000

/** YYYY-MM-DD の前の日の YYYY-MM-DD。 */
const dayBefore = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10)

const endDateOf = (values: RecurringRuleFormValues) => (values.hasEndDate ? values.endDate : null)

/**
 * 予定の編集の「この日以降の全ての回」の検証。initial は開いたときの繰り返しの欄の値、occurrenceDate は開いた回の日である。
 * 何も変えていなければ頻度の欄に、終了日が早すぎれば終了日の欄に誤りを付ける。
 * 終了日だけを変えるときは開いた回の日の前の日まで、繰り返しを変えるときは開いた回の日まで早められる。
 * 予定の API は、今日の前の日より前の終了日と、今日より前の適用の日を拒む。画面は、開いた回が今日より前なら保存させない。
 */
export const createRecurringRuleChangeSchema = (
  initial: RecurringRuleFormValues,
  occurrenceDate: string,
) =>
  z.object({ recurrence: recurringRuleFormSchema }).superRefine(({ recurrence }, ctx) => {
    const repetitionChanged = !sameRepetition(recurrence, initial)
    if (!repetitionChanged && endDateOf(recurrence) === endDateOf(initial)) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence', 'frequency'],
        message: '今の繰り返しから変えてください',
      })
      return
    }
    if (!recurrence.hasEndDate || !z.iso.date().safeParse(recurrence.endDate).success) return
    if (repetitionChanged && recurrence.endDate < occurrenceDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence', 'endDate'],
        message: `繰り返しを変えるときは、終了日を ${occurrenceDate} 以降にしてください`,
      })
      return
    }
    const earliest = dayBefore(occurrenceDate)
    if (recurrence.endDate < earliest) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence', 'endDate'],
        message: `終了日は ${earliest} 以降にしてください`,
      })
    }
  })

/**
 * 規則の変更で送る規則。繰り返しを変えずに終了日だけを変えたときは、今の規則 current の終了日だけを替える。
 * 予定の API は、規則が終了日のほかに同じなら、終了日だけの変更として扱い、繰り返しの予定を分けない。
 */
export const recurringRuleToSend = (
  values: RecurringRuleFormShape,
  initial: RecurringRuleFormValues,
  current: RecurringRule,
): RecurringRule =>
  sameRepetition(values.recurrence, initial)
    ? { ...current, endDate: endDateOf(values.recurrence) }
    : toRecurringRule(values.recurrence)
