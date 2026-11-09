import { describe, expect, it } from 'vite-plus/test'

import type { RecurringRule } from '#/api/types'

import { toRecurringRuleFormValues } from './recurringRuleForm'
import { followScheduleDate, startsOn } from './scheduleCreateForm'

const createRecurrenceFormValues = (date: string) => toRecurringRuleFormValues(undefined, date)

const rule = (patch: Partial<RecurringRule>): RecurringRule => ({
  frequency: 'weekly',
  daysOfWeek: null,
  interval: null,
  dayOfWeek: null,
  dayOfMonth: null,
  weekOfMonth: null,
  endDate: null,
  ...patch,
})

describe('startsOn', () => {
  // 2026-11-09 は月曜で、11 月の第 2 週である
  it.each([
    ['毎週の曜日に日付の曜日を含む', rule({ daysOfWeek: [1, 4], interval: 2 }), true],
    ['毎週の曜日に日付の曜日を含まない', rule({ daysOfWeek: [2, 4] }), false],
    ['毎月の日が日付の日と同じ', rule({ frequency: 'monthly', dayOfMonth: 9 }), true],
    ['毎月の日が日付の日と違う', rule({ frequency: 'monthly', dayOfMonth: 10 }), false],
    [
      '毎月の第何週の曜日が日付と同じ',
      rule({ frequency: 'monthly', weekOfMonth: 2, dayOfWeek: 1 }),
      true,
    ],
    [
      '毎月の第何週が日付と違う',
      rule({ frequency: 'monthly', weekOfMonth: 3, dayOfWeek: 1 }),
      false,
    ],
  ])('%s', (_, r, expected) => {
    expect(startsOn(r, '2026-11-09')).toBe(expected)
  })
})

describe('followScheduleDate', () => {
  it('前の日付の曜日の毎週なら、新しい日付の曜日にし、終了日の初期の日もそろえる', () => {
    const followed = followScheduleDate(
      createRecurrenceFormValues('2026-11-09'),
      '2026-11-09',
      '2026-11-12',
    )
    expect(followed).toMatchObject({ weeklyDays: [4], endDate: '2026-11-12' })
  })

  it('カスタムで選んだ別の曜日と、決めた終了日は変えない', () => {
    const values = {
      ...createRecurrenceFormValues('2026-11-09'),
      dayOfWeek: 3,
      weeklyDays: [3],
      hasEndDate: true,
      endDate: '2027-03-31',
    }
    expect(followScheduleDate(values, '2026-11-09', '2026-11-12')).toEqual(values)
  })

  it('前の日付の第何週の曜日なら、新しい日付の第何週の曜日にする', () => {
    const values = {
      ...createRecurrenceFormValues('2026-11-09'),
      frequency: 'monthly' as const,
      monthlyBy: 'weekday' as const,
    }
    expect(followScheduleDate(values, '2026-11-09', '2026-11-18')).toMatchObject({
      dayOfWeek: 3,
      weekOfMonth: 3,
    })
  })
})
