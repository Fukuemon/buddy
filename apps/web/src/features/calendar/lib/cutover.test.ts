import { describe, expect, it } from 'vite-plus/test'

import type { CalendarCutoverCalendar, CalendarCutoverUnmet } from '#/api/types'

import { formatCutoverImport, formatCutoverSync, formatUnmetDateTime, isAllSynced } from './cutover'

const unmet = (patch: Partial<CalendarCutoverUnmet>): CalendarCutoverUnmet => ({
  external_calendar_id: 'calendar-1',
  staff_id: 'staff-1',
  staff_name: '青木 一郎',
  reason: 'changed',
  external_event_id: 'event-1',
  date: '2026-11-04',
  start_time: '10:00',
  end_time: '11:00',
  ends_next_day: false,
  review_reason: null,
  ...patch,
})

const calendar = (patch: Partial<CalendarCutoverCalendar>): CalendarCutoverCalendar => ({
  external_calendar_id: 'calendar-1',
  staff_id: 'staff-1',
  staff_name: '青木 一郎',
  last_status: 'succeeded',
  last_succeeded_at: '2026-11-05T01:00:00Z',
  last_error: null,
  last_import: null,
  ...patch,
})

describe('formatUnmetDateTime', () => {
  it('日時を読めた予定は、日付と時刻を出す', () => {
    expect(formatUnmetDateTime(unmet({}))).toBe('2026年11月4日（水） 10:00〜11:00')
    expect(
      formatUnmetDateTime(unmet({ start_time: '22:00', end_time: '01:00', ends_next_day: true })),
    ).toBe('2026年11月4日（水） 22:00〜翌 01:00')
  })

  it('日付だけの予定と、日時の無い理由は、読めた分だけ出す', () => {
    expect(formatUnmetDateTime(unmet({ start_time: null, end_time: null }))).toBe(
      '2026年11月4日（水）',
    )
    expect(formatUnmetDateTime(unmet({ reason: 'sync_stale', date: null }))).toBe('—')
  })
})

describe('カレンダーの状況', () => {
  it('取り込んでいないカレンダーと、同期が失敗したカレンダーを文にする', () => {
    expect(formatCutoverImport(calendar({}))).toBe('まだ取り込んでいない')
    expect(formatCutoverSync(calendar({ last_succeeded_at: null, last_status: 'never' }))).toBe(
      'まだ同期していない',
    )
    expect(formatCutoverSync(calendar({ last_status: 'failed' }))).toMatch(/（最後の同期は失敗）$/)
  })

  it('全てのカレンダーの最後の同期が成功しているときだけ、始められる', () => {
    expect(isAllSynced([calendar({}), calendar({ external_calendar_id: 'calendar-2' })])).toBe(true)
    expect(isAllSynced([calendar({}), calendar({ last_status: 'never' })])).toBe(false)
    expect(isAllSynced([])).toBe(true)
  })
})
