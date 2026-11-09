import type { RecurringRule } from '#/api/types'
import { describe, expect, it } from 'vite-plus/test'

import { recurringRuleLabel, repetitionLabel } from './recurringRuleLabel'

const weekly = (daysOfWeek: number[] | null, interval: number): RecurringRule => ({
  frequency: 'weekly',
  daysOfWeek,
  interval,
  dayOfWeek: null,
  dayOfMonth: null,
  weekOfMonth: null,
  endDate: null,
})

const monthly = (rule: Partial<RecurringRule>): RecurringRule => ({
  frequency: 'monthly',
  daysOfWeek: null,
  interval: null,
  dayOfWeek: null,
  dayOfMonth: null,
  weekOfMonth: null,
  endDate: null,
  ...rule,
})

describe('recurringRuleLabel', () => {
  it('毎週の規則は、間隔の文言と曜日の並びにする', () => {
    expect(recurringRuleLabel(weekly([2], 1), '2026-11-10')).toBe('毎週 火曜日')
    expect(recurringRuleLabel(weekly([1, 4], 2), '2026-11-09')).toBe('隔週 月曜日、木曜日')
    expect(recurringRuleLabel(weekly([2], 3), '2026-11-10')).toBe('3 週ごと 火曜日')
  })

  it('7 つの曜日で間隔 1 の規則は「毎日」にし、終了日があれば後ろに付ける', () => {
    const allDays = [1, 2, 3, 4, 5, 6, 7]
    expect(recurringRuleLabel(weekly(allDays, 1), '2026-11-09')).toBe('毎日')
    expect(recurringRuleLabel({ ...weekly(allDays, 1), endDate: '2027-03-31' }, '2026-11-09')).toBe(
      '毎日（2027年3月31日（水）まで）',
    )
  })

  it('7 つの曜日で、間隔を持たないか間隔の欄が空の規則も「毎日」にする', () => {
    const allDays = [1, 2, 3, 4, 5, 6, 7]
    expect(recurringRuleLabel({ ...weekly(allDays, 1), interval: null }, '2026-11-09')).toBe('毎日')
    expect(recurringRuleLabel(weekly(allDays, Number.NaN), '2026-11-09')).toBe('毎日')
  })

  it('7 つの曜日で間隔 2 以上の規則は、間隔の文言と曜日の並びにする', () => {
    expect(recurringRuleLabel(weekly([1, 2, 3, 4, 5, 6, 7], 2), '2026-11-09')).toBe(
      '隔週 月曜日、火曜日、水曜日、木曜日、金曜日、土曜日、日曜日',
    )
  })

  it('曜日を持たない毎週の規則は、回の日の曜日にする', () => {
    expect(recurringRuleLabel(weekly(null, 1), '2026-11-09')).toBe('毎週 月曜日')
  })

  it('間隔を持たない毎週の規則は、「毎週」にする', () => {
    expect(recurringRuleLabel({ ...weekly([2], 1), interval: null }, '2026-11-10')).toBe(
      '毎週 火曜日',
    )
  })

  it('日にちも週も持たない毎月の規則は、回の日の日にちにする', () => {
    expect(recurringRuleLabel(monthly({}), '2026-11-09')).toBe('毎月 9 日')
  })

  it('毎月の規則は、日にちか、第何週の曜日にする', () => {
    expect(recurringRuleLabel(monthly({ dayOfMonth: 9 }), '2026-11-09')).toBe('毎月 9 日')
    expect(recurringRuleLabel(monthly({ dayOfWeek: 1, weekOfMonth: 2 }), '2026-11-09')).toBe(
      '毎月 第 2 月曜日',
    )
  })

  it('終了日があれば、後ろに「（年月日まで）」を付ける', () => {
    expect(
      recurringRuleLabel(
        monthly({ dayOfWeek: 1, weekOfMonth: 2, endDate: '2027-03-31' }),
        '2026-11-09',
      ),
    ).toBe('毎月 第 2 月曜日（2027年3月31日（水）まで）')
  })
})

describe('repetitionLabel', () => {
  const values = {
    frequency: 'weekly',
    weeklyDays: [4, 1, 4],
    interval: 2,
    monthlyBy: 'day',
    dayOfMonth: 9,
    weekOfMonth: 2,
    dayOfWeek: 1,
  } as const

  it('毎週の曜日は、重なりを除いて月曜から日曜の順に並べる', () => {
    expect(repetitionLabel({ ...values, weeklyDays: [...values.weeklyDays] })).toBe(
      '隔週 月曜日、木曜日',
    )
  })

  it('間隔の欄が空の間は、7 つの曜日を「毎日」にする', () => {
    expect(
      repetitionLabel({ ...values, weeklyDays: [7, 1, 2, 3, 4, 5, 6], interval: Number.NaN }),
    ).toBe('毎日')
  })

  it('毎月の値は、決め方の欄の値だけを使う', () => {
    expect(repetitionLabel({ ...values, weeklyDays: [], frequency: 'monthly' })).toBe('毎月 9 日')
    expect(
      repetitionLabel({ ...values, weeklyDays: [], frequency: 'monthly', monthlyBy: 'weekday' }),
    ).toBe('毎月 第 2 月曜日')
  })
})
