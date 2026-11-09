import { describe, expect, it } from 'vite-plus/test'

import type { OpenCalendarCutover, Schedule } from '#/api/types'

import { canChangeSchedule, canDeleteSchedule } from './scheduleWritable'

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

describe('canDeleteSchedule', () => {
  const startOfDay = new Date('2026-10-20T00:00:00+09:00')

  it('buddy_primary の事業所の、開始の日が今日以降の有効な予定は削除できる', () => {
    expect(canDeleteSchedule(schedule, 'buddy_primary', null, startOfDay)).toBe(true)
    expect(
      canDeleteSchedule(schedule, 'buddy_primary', null, new Date('2026-10-01T12:00:00+09:00')),
    ).toBe(true)
  })

  it('開始の日が今日より前の予定は、Asia/Tokyo の日付で比べて削除できない', () => {
    // 2026-10-20T15:00Z は Asia/Tokyo では 10 月 21 日の 0 時で、予定の開始の日の翌日である
    expect(
      canDeleteSchedule(schedule, 'buddy_primary', null, new Date('2026-10-20T15:00:00Z')),
    ).toBe(false)
    expect(
      canDeleteSchedule(schedule, 'buddy_primary', null, new Date('2026-10-20T14:59:59Z')),
    ).toBe(true)
  })

  it('google_primary の事業所の予定と、キャンセルした予定と、切り替えている間は削除できない', () => {
    expect(canDeleteSchedule(schedule, 'google_primary', null, startOfDay)).toBe(false)
    const cancelled = { ...schedule, cancel: { reason: '中止' } }
    expect(canDeleteSchedule(cancelled, 'buddy_primary', null, startOfDay)).toBe(false)
    expect(canDeleteSchedule(schedule, 'buddy_primary', cutover, startOfDay)).toBe(false)
  })
})
