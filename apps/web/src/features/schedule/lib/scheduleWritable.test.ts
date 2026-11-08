import { describe, expect, it } from 'vite-plus/test'

import type { OpenCalendarCutover, Schedule } from '#/api/types'

import { canChangeSchedule } from './scheduleWritable'

const schedule: Schedule = {
  id: 'schedule-1',
  facilityId: 'facility-1',
  kind: 'normal',
  title: '研修',
  staffId: 'staff-1',
  startsAt: '2026-10-20T09:00:00+09:00',
  endsAt: '2026-10-20T10:00:00+09:00',
  description: '',
}

const cutover: OpenCalendarCutover = {
  started_at: '2026-10-20T00:00:00Z',
  started_by: 'staff-1',
  started_by_name: '佐藤 一郎',
  range_start: '2026-10-01',
}

describe('canChangeSchedule', () => {
  it('buddy の予定と Google カレンダーの予定は、変更とキャンセルができる', () => {
    for (const s of [schedule, { ...schedule, fromGoogleCalendar: true as const, etag: '"1"' }]) {
      expect(canChangeSchedule(s, null)).toBe(true)
    }
  })

  it('予定の正本を切り替えている間と、キャンセルした予定は、変更もキャンセルもできない', () => {
    expect(canChangeSchedule(schedule, cutover)).toBe(false)
    const cancelled = { ...schedule, cancel: { reason: '中止' } }
    expect(canChangeSchedule(cancelled, null)).toBe(false)
  })

  it('buddy の繰り返しの規則に写せない Google カレンダーの予定は、変更もキャンセルもできない', () => {
    const unsupported = { ...schedule, reviewReason: 'recurrence_unsupported' as const }
    expect(canChangeSchedule(unsupported, null)).toBe(false)
    const mismatch = { ...schedule, reviewReason: 'title_mismatch' as const }
    expect(canChangeSchedule(mismatch, null)).toBe(true)
  })
})
