import { describe, expect, it } from 'vite-plus/test'

import type { ImportReviewItem } from '#/api/types'

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
    expect(formatLastImport(run)).toBe(
      '2026年10月20日（火） 15:42（2026年10月1日（木）〜2026年10月31日（土））',
    )
    expect(formatLastImport({ ...run, status: 'failed' })).toBe(
      '2026年10月20日（火） 15:42（失敗）（2026年10月1日（木）〜2026年10月31日（土））',
    )
    expect(formatLastImport(null)).toBe('なし')
  })
})

describe('formatReviewDateTime', () => {
  const item: ImportReviewItem = {
    external_event_id: 'e',
    revision: 'r',
    date: '2026-11-04',
    start_time: '10:00',
    end_time: '11:00',
    ends_next_day: false,
    service: '訪看I2',
    client_name: '利用者',
    reason: 'patient_not_found',
    recurrence: null,
    candidates: [],
  }
  it('曜日と時刻の範囲を付ける', () => {
    expect(formatReviewDateTime(item)).toBe('2026年11月4日（水） 10:00〜11:00')
  })
  it('終了が翌日の予定は、終了の時刻に「翌」を付ける', () => {
    expect(
      formatReviewDateTime({
        ...item,
        start_time: '22:00',
        end_time: '01:00',
        ends_next_day: true,
      }),
    ).toBe('2026年11月4日（水） 22:00〜翌 01:00')
  })
})

describe('formatRecurrence', () => {
  it.each([
    [{ frequency: 'weekly', days_of_week: [3], interval: 1 }, '毎週水曜日の繰り返し'],
    [{ frequency: 'weekly', days_of_week: [7], interval: 1 }, '毎週日曜日の繰り返し'],
    [{ frequency: 'weekly', days_of_week: [1, 4], interval: 1 }, '毎週月曜日、木曜日の繰り返し'],
    [{ frequency: 'weekly', days_of_week: [2], interval: 2 }, '隔週火曜日の繰り返し'],
    [{ frequency: 'weekly', days_of_week: [2], interval: 3 }, '3 週ごとの火曜日の繰り返し'],
    [{ frequency: 'monthly', day_of_month: 15 }, '毎月 15 日の繰り返し'],
    [{ frequency: 'monthly', week_of_month: 2, day_of_week: 1 }, '毎月第 2 月曜日の繰り返し'],
  ] as const)('%o を文にする', (rule, expected) => {
    expect(
      formatRecurrence({
        ...rule,
        days_of_week: 'days_of_week' in rule ? [...rule.days_of_week] : undefined,
      }),
    ).toBe(expected)
  })
})

describe('formatSkippedDateTime', () => {
  const item = {
    date: '2026-11-12',
    start_time: '17:00',
    end_time: '09:00',
    ends_next_day: false,
    all_day: false,
  }
  it.each([
    [{ ...item, reason: 'multi_day' }, '2026年11月12日（木） 17:00〜翌 09:00'],
    [
      { ...item, ends_next_day: true, reason: 'service_not_found' },
      '2026年11月12日（木） 17:00〜翌 09:00',
    ],
    [
      { ...item, all_day: true, start_time: null, end_time: null, reason: 'all_day' },
      '2026年11月12日（木） 終日',
    ],
    [{ ...item, date: null, reason: 'unreadable_time' }, '日時を読めない'],
    [{ ...item, end_time: '17:00', reason: 'zero_length' }, '2026年11月12日（木） 17:00〜17:00'],
  ] as const)('%o を読めた分だけ出す', (skipped, expected) => {
    expect(formatSkippedDateTime(skipped)).toBe(expected)
  })
})
