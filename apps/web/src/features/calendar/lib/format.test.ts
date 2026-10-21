import { describe, expect, it } from 'vite-plus/test'

import {
  formatLastImport,
  formatRecurrence,
  formatReviewDateTime,
  formatSkippedDateTime,
} from './format'

const run = {
  id: 'import-1',
  range_start: '2026-10-01',
  range_end: '2026-10-31',
  status: 'succeeded',
  imported_count: 1,
  skipped_count: 0,
  started_at: '2026-10-20T06:41:00Z',
  finished_at: '2026-10-20T06:42:00Z',
} as const

describe('formatLastImport', () => {
  it('終わった日時と期間を出し、失敗なら日時の後に印を付ける', () => {
    expect(formatLastImport(run)).toBe('2026/10/20 15:42（2026/10/01〜2026/10/31）')
    expect(formatLastImport({ ...run, status: 'failed' })).toBe(
      '2026/10/20 15:42（失敗）（2026/10/01〜2026/10/31）',
    )
    expect(formatLastImport(null)).toBe('なし')
  })
})

describe('formatReviewDateTime', () => {
  it('曜日と時刻の範囲を付ける', () => {
    expect(
      formatReviewDateTime({
        external_event_id: 'e',
        date: '2026-11-04',
        start_time: '10:00',
        end_time: '11:00',
        service: '訪看I2',
        client_name: '利用者',
        reason: 'patient_not_found',
        recurrence: null,
        candidates: [],
      }),
    ).toBe('2026/11/04（水）10:00〜11:00')
  })
})

describe('formatRecurrence', () => {
  it.each([
    [{ frequency: 'weekly', day_of_week: 3 }, '毎週水曜日の繰り返し'],
    [{ frequency: 'weekly', day_of_week: 7 }, '毎週日曜日の繰り返し'],
    [{ frequency: 'monthly', day_of_month: 15 }, '毎月 15 日の繰り返し'],
    [{ frequency: 'monthly', week_of_month: 2, day_of_week: 1 }, '毎月第 2 月曜日の繰り返し'],
  ] as const)('%o を文にする', (rule, expected) => {
    expect(formatRecurrence(rule)).toBe(expected)
  })
})

describe('formatSkippedDateTime', () => {
  const item = { date: '2026-11-12', start_time: '17:00', end_time: '09:00', all_day: false }
  it.each([
    [{ ...item, reason: 'multi_day' }, '2026/11/12（木）17:00〜翌 09:00'],
    [
      { ...item, all_day: true, start_time: null, end_time: null, reason: 'all_day' },
      '2026/11/12（木）終日',
    ],
    [{ ...item, date: null, reason: 'unreadable_time' }, '日時を読めない'],
    [{ ...item, end_time: '17:00', reason: 'zero_length' }, '2026/11/12（木）17:00〜17:00'],
  ] as const)('%o を読めた分だけ出す', (skipped, expected) => {
    expect(formatSkippedDateTime(skipped)).toBe(expected)
  })
})
