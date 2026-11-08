import { describe, expect, it } from 'vite-plus/test'

import type { RecurringRule } from '#/api/types'

import { createRecurringRuleChangeSchema, recurringRuleToSend } from './recurringRuleChange'
import { toRecurringRule, toRecurringRuleFormValues } from './recurringRuleForm'

const OPENED = '2026-10-20'
const WEEKLY: RecurringRule = {
  frequency: 'weekly',
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
    expect(messages({ dayOfWeek: 2 })).toEqual(['今の繰り返しから変えてください'])
  })

  it('繰り返しを変えるときは、終了日を開いた回の日より前にできない', () => {
    expect(messages({ dayOfWeek: 3, hasEndDate: true, endDate: '2026-10-19' })).toEqual([
      '繰り返しを変えるときは、終了日を 2026-10-20 以降にしてください',
    ])
    expect(messages({ dayOfWeek: 3, hasEndDate: true, endDate: '2026-10-20' })).toEqual([])
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
      dayOfWeek: null,
      dayOfMonth: 20,
      weekOfMonth: null,
      endDate: null,
    })
  })
})
