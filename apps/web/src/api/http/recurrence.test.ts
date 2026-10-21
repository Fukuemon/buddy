// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import {
  expandRecurring,
  occurrenceId,
  occurs,
  parseOccurrenceId,
  type ApiRecurringSchedule,
} from './recurrence'

const recurring = (
  date: string,
  rule: ApiRecurringSchedule['recurring_rule'],
  exclusions: string[] = [],
): ApiRecurringSchedule => ({
  id: '01M3TC6E9G4N8Q2R5T7V9W1X3Y',
  facility_id: 'facility-1',
  schedule_type_id: 'type-normal',
  schedule_type: '通常',
  date,
  start_time: '09:00',
  end_time: '09:30',
  is_over_time_work: false,
  staff_id: 'staff-1',
  staff_name: '',
  title: '定例',
  description: null,
  visit_info: null,
  recurring_rule: rule,
  exclusion_dates: exclusions,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
})

describe('occurs', () => {
  it.each([
    // 2026-11-04 は水曜
    ['毎週は最初の日付の曜日', { frequency: 'weekly' as const }, '2026-11-11', true],
    ['毎週の曜日の指定', { frequency: 'weekly' as const, day_of_week: 5 }, '2026-11-06', true],
    ['最初の日付より前は回にしない', { frequency: 'weekly' as const }, '2026-10-28', false],
    [
      '終了日の後は回にしない',
      { frequency: 'weekly' as const, end_date: '2026-11-10' },
      '2026-11-11',
      false,
    ],
    ['毎月は最初の日付の日', { frequency: 'monthly' as const }, '2026-12-04', true],
    ['毎月の日の指定', { frequency: 'monthly' as const, day_of_month: 4 }, '2027-01-04', true],
    [
      '毎月の第 n の曜日',
      { frequency: 'monthly' as const, week_of_month: 1, day_of_week: 3 },
      '2026-12-02',
      true,
    ],
    [
      '毎月の第 n の曜日に当たらない日',
      { frequency: 'monthly' as const, week_of_month: 1, day_of_week: 3 },
      '2026-12-09',
      false,
    ],
  ])('%s', (_, rule, date, want) => {
    expect(occurs(recurring('2026-11-04', rule), date)).toBe(want)
  })
})

describe('expandRecurring', () => {
  it('期間の回を単発の予定の形で返し、除外した日を除く', () => {
    const rs = recurring('2026-11-04', { frequency: 'weekly' }, ['2026-11-11'])
    const got = expandRecurring(rs, '2026-11-01', '2026-11-30')
    expect(got.map((s) => s.date)).toEqual(['2026-11-04', '2026-11-18', '2026-11-25'])
    expect(got[0]).toMatchObject({
      id: occurrenceId(rs.id, '2026-11-04'),
      recurring_schedule_id: rs.id,
      start_time: '09:00',
      cancel: null,
    })
  })

  it('回の ID を繰り返しの予定の ID と日付に戻す', () => {
    expect(parseOccurrenceId(occurrenceId('01M3TC6E9G4N8Q2R5T7V9W1X3Y', '2026-11-04'))).toEqual({
      recurringId: '01M3TC6E9G4N8Q2R5T7V9W1X3Y',
      date: '2026-11-04',
    })
    expect(parseOccurrenceId('01M3TC6E9G4N8Q2R5T7V9W1X3Y')).toBeUndefined()
  })
})
