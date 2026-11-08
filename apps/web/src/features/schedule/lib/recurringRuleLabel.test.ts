import type { RecurringRule } from '#/api/types'
import { describe, expect, it } from 'vite-plus/test'

import { recurringRuleLabel } from './recurringRuleLabel'

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

  it('曜日を持たない毎週の規則は、回の日の曜日にする', () => {
    expect(recurringRuleLabel(weekly(null, 1), '2026-11-09')).toBe('毎週 月曜日')
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
    ).toBe('毎月 第 2 月曜日（2027年3月31日まで）')
  })
})
