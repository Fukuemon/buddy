import { describe, expect, it } from 'vite-plus/test'

import type { CalendarSyncStatus } from '#/api/types'

import { calendarSyncProblemsOf } from './calendarSync'

const now = new Date('2026-11-05T01:00:00Z')

const sync = (overrides: Partial<CalendarSyncStatus>): CalendarSyncStatus => ({
  external_calendar_id: 'calendar-1',
  staff_id: 'staff-1',
  staff_name: '青木 一郎',
  last_status: 'succeeded',
  last_succeeded_at: '2026-11-05T00:59:00Z',
  last_error: null,
  ...overrides,
})

describe('calendarSyncProblemsOf', () => {
  it('10 分以内に同期できたカレンダーは当てない', () => {
    expect(
      calendarSyncProblemsOf([sync({ last_succeeded_at: '2026-11-05T00:50:00Z' })], now),
    ).toEqual([])
  })

  it('10 分より前に同期できたカレンダーは stale にする', () => {
    expect(
      calendarSyncProblemsOf([sync({ last_succeeded_at: '2026-11-05T00:49:59Z' })], now).map(
        (p) => p.problem,
      ),
    ).toEqual(['stale'])
  })

  it('最後の同期が失敗したカレンダーは、最後に同期できた時刻によらず failed にする', () => {
    expect(
      calendarSyncProblemsOf([sync({ last_status: 'failed', last_error: 'unavailable' })], now).map(
        (p) => p.problem,
      ),
    ).toEqual(['failed'])
  })

  it('同期できたことが無いカレンダーは never にする', () => {
    expect(
      calendarSyncProblemsOf([sync({ last_status: 'never', last_succeeded_at: null })], now).map(
        (p) => p.problem,
      ),
    ).toEqual(['never'])
  })
})
