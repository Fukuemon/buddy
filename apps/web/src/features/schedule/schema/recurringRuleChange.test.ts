import { describe, expect, it } from 'vite-plus/test'

import type { RecurringRule } from '#/api/types'

import { createRecurringRuleChangeSchema, recurringRuleToSend } from './recurringRuleChange'
import { toRecurringRule, toRecurringRuleFormValues } from './recurringRuleForm'

const OPENED = '2026-10-20'
const WEEKLY: RecurringRule = {
  frequency: 'weekly',
  daysOfWeek: null,
  interval: 1,
  dayOfWeek: null,
  dayOfMonth: null,
  weekOfMonth: null,
  endDate: null,
}
const initial = toRecurringRuleFormValues(WEEKLY, OPENED)
const schema = createRecurringRuleChangeSchema(initial, OPENED)

const messages = (recurrence: Partial<typeof initial>) => {
  const result = schema.safeParse({ recurrence: { ...initial, ...recurrence } })
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('toRecurringRuleFormValues', () => {
  it('規則が持たない曜日、日、週を、開いた回の日から決める', () => {
    expect(initial).toMatchObject({
      dayOfWeek: 2,
      weeklyDays: [2],
      dayOfMonth: 20,
      weekOfMonth: 3,
      monthlyBy: 'day',
    })
  })

  it('毎月の第何週の曜日の規則は、決め方を weekday にする', () => {
    const values = toRecurringRuleFormValues(
      { ...WEEKLY, frequency: 'monthly', weekOfMonth: 3 },
      OPENED,
    )
    expect(values.monthlyBy).toBe('weekday')
    expect(toRecurringRule(values)).toEqual({
      frequency: 'monthly',
      daysOfWeek: null,
      interval: null,
      dayOfWeek: 2,
      dayOfMonth: null,
      weekOfMonth: 3,
      endDate: null,
    })
  })
})

describe('createRecurringRuleChangeSchema', () => {
  it('何も変えていなければ、変えることを促す', () => {
    expect(messages({})).toEqual(['今の繰り返しから変えてください'])
  })

  it('規則の空の項目を開いた回の日で埋めた値は、変えていないものとして扱う', () => {
    expect(messages({ weeklyDays: [2] })).toEqual(['今の繰り返しから変えてください'])
  })

  it('繰り返しを変えるときは、終了日を開いた回の日より前にできない', () => {
    expect(messages({ weeklyDays: [3], hasEndDate: true, endDate: '2026-10-19' })).toEqual([
      '繰り返しを変えるときは、終了日を 2026-10-20 以降にしてください',
    ])
    expect(messages({ weeklyDays: [3], hasEndDate: true, endDate: '2026-10-20' })).toEqual([])
  })

  it('終了日だけを変えるときは、開いた回の日の前の日まで早められる', () => {
    expect(messages({ hasEndDate: true, endDate: '2026-10-19' })).toEqual([])
    expect(messages({ hasEndDate: true, endDate: '2026-10-18' })).toEqual([
      '終了日は 2026-10-19 以降にしてください',
    ])
  })

  it('終了日を決めて日付を入れていなければ、入れることを促す', () => {
    expect(messages({ hasEndDate: true, endDate: '' })).toEqual(['終了日を入力してください'])
  })

  it('毎週で曜日を 1 つも選ばなければ、選ぶことを促す', () => {
    expect(messages({ weeklyDays: [] })).toEqual(['曜日を 1 つ以上選んでください'])
  })

  it('毎週の間隔は 1〜52 の整数だけを受け、空の欄も拒む', () => {
    const message = '間隔は 1〜52 の週の数で入力してください'
    expect(messages({ interval: 0 })).toEqual([message])
    expect(messages({ interval: 53 })).toEqual([message])
    expect(messages({ interval: 1.5 })).toEqual([message])
    expect(messages({ interval: Number.NaN })).toEqual([message])
    expect(messages({ interval: 52 })).toEqual([])
  })

  it('毎月では、使わない曜日と間隔の欄を確認しない', () => {
    expect(messages({ frequency: 'monthly', weeklyDays: [], interval: 0 })).toEqual([])
  })
})

describe('recurringRuleToSend', () => {
  it('終了日だけを変えたときは、今の規則の終了日だけを替える', () => {
    const values = { recurrence: { ...initial, hasEndDate: true, endDate: '2027-03-31' } }
    expect(recurringRuleToSend(values, initial, WEEKLY)).toEqual({
      ...WEEKLY,
      endDate: '2027-03-31',
    })
  })

  it('繰り返しを変えたときは、欄の値の規則を送る', () => {
    const values = { recurrence: { ...initial, frequency: 'monthly' as const } }
    expect(recurringRuleToSend(values, initial, WEEKLY)).toEqual({
      frequency: 'monthly',
      daysOfWeek: null,
      interval: null,
      dayOfWeek: null,
      dayOfMonth: 20,
      weekOfMonth: null,
      endDate: null,
    })
  })
})

describe('複数の曜日と間隔の毎週の規則', () => {
  /** 隔週の月曜と木曜。2026-10-22（木曜）の回を開く。 */
  const OPENED_THURSDAY = '2026-10-22'
  const BIWEEKLY: RecurringRule = { ...WEEKLY, daysOfWeek: [1, 4], interval: 2 }
  const biweekly = toRecurringRuleFormValues(BIWEEKLY, OPENED_THURSDAY)
  const biweeklySchema = createRecurringRuleChangeSchema(biweekly, OPENED_THURSDAY)
  const send = (recurrence: Partial<typeof biweekly>) =>
    recurringRuleToSend({ recurrence: { ...biweekly, ...recurrence } }, biweekly, BIWEEKLY)

  it('欄の値は、元の曜日の並びと間隔を持ち、毎月の曜日には開いた回の曜日を入れる', () => {
    expect(biweekly).toMatchObject({ dayOfWeek: 4, weeklyDays: [1, 4], interval: 2 })
    expect(toRecurringRule(biweekly)).toMatchObject({ daysOfWeek: [1, 4], interval: 2 })
  })

  it('何も変えていなければ、変えることを促す', () => {
    const result = biweeklySchema.safeParse({ recurrence: biweekly })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
      '今の繰り返しから変えてください',
    ])
  })

  it('終了日だけを変えたときは、今の規則の曜日の並びと間隔をそのまま送る', () => {
    expect(send({ hasEndDate: true, endDate: '2027-03-31' })).toEqual({
      ...BIWEEKLY,
      endDate: '2027-03-31',
    })
  })

  it('開いた回の曜日の 1 つにしたときは、その曜日と元の間隔を送る', () => {
    expect(send({ dayOfWeek: 4, weeklyDays: [4] })).toMatchObject({
      daysOfWeek: [4],
      interval: 2,
    })
  })

  it('曜日を足したときは、月曜から日曜の順に並べて、元の間隔で送る', () => {
    expect(send({ weeklyDays: [4, 1, 3] })).toMatchObject({ daysOfWeek: [1, 3, 4], interval: 2 })
  })

  it('間隔を変えたときは、元の曜日の並びと新しい間隔を送る', () => {
    expect(send({ interval: 3 })).toEqual({ ...BIWEEKLY, interval: 3 })
  })

  it('曜日の並びを選んだ順の違いだけで変えても、変えていないものとして扱う', () => {
    const result = biweeklySchema.safeParse({ recurrence: { ...biweekly, weeklyDays: [4, 1] } })
    expect(result.success).toBe(false)
  })

  it('毎月の規則から毎週に変えたときは、曜日の欄の 1 つの曜日と、間隔 1 を送る', () => {
    const monthly: RecurringRule = {
      ...WEEKLY,
      frequency: 'monthly',
      daysOfWeek: null,
      interval: null,
      dayOfMonth: 22,
    }
    const values = toRecurringRuleFormValues(monthly, OPENED_THURSDAY)
    expect(
      recurringRuleToSend({ recurrence: { ...values, frequency: 'weekly' } }, values, monthly),
    ).toMatchObject({ frequency: 'weekly', daysOfWeek: [4], interval: 1 })
  })
})
