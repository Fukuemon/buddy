import { describe, expect, it } from 'vite-plus/test'

import type { Schedule, ScheduleReviewReason } from '#/api/types'

import { canAddVisitInfo } from './reviewFix'

const schedule: Schedule = {
  id: 'gcal-1',
  facilityId: 'facility-1',
  kind: 'normal',
  title: '【訪看I2】未登録 次郎',
  staffId: 'staff-1',
  startsAt: '2026-10-20T09:00:00+09:00',
  endsAt: '2026-10-20T09:29:00+09:00',
  description: '',
  fromGoogleCalendar: true,
}

describe('canAddVisitInfo', () => {
  it.each<[ScheduleReviewReason, boolean]>([
    ['patient_not_found', true],
    ['patient_ambiguous', true],
    ['service_code_not_found', true],
    ['title_unreadable', true],
    ['title_mismatch', false],
    ['recurrence_unsupported', false],
  ])('確認が必要な理由が %s の Google カレンダーの予定では %s を返す', (reason, expected) => {
    expect(canAddVisitInfo({ ...schedule, reviewReason: reason })).toBe(expected)
  })

  it('確認が必要な理由が無い予定では false を返す', () => {
    expect(canAddVisitInfo(schedule)).toBe(false)
  })

  it('Google カレンダーの予定でなければ、理由があっても false を返す', () => {
    expect(
      canAddVisitInfo({
        ...schedule,
        fromGoogleCalendar: undefined,
        reviewReason: 'title_unreadable',
      }),
    ).toBe(false)
  })
})
