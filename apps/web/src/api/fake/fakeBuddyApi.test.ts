import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '../BuddyApi'
import { createFakeBuddyApi } from './fakeBuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'

const baseDate = new Date(2026, 9, 20)
const range = { from: '2026-10-20T00:00:00+09:00', to: '2026-10-21T00:00:00+09:00' }

describe('createFakeBuddyApi', () => {
  it('期間と職員で予定を絞り込む', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const all = await api.schedules.list(MOCK_FACILITY_ID, range)
    const filtered = await api.schedules.list(MOCK_FACILITY_ID, { ...range, staffIds: ['staff-1'] })
    expect(all.schedules.map((s) => s.id)).toEqual([
      'schedule-1',
      'schedule-2',
      'schedule-3',
      'schedule-7',
    ])
    expect(filtered.schedules.map((s) => s.id)).toEqual(['schedule-1'])
  })

  it('翌日の期間に、前の日に始まり翌日に終わる予定を返す', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const nextDay = await api.schedules.list(MOCK_FACILITY_ID, {
      from: '2026-10-21T00:00:00+09:00',
      to: '2026-10-22T00:00:00+09:00',
    })
    expect(nextDay.schedules.map((s) => s.id)).toContain('schedule-7')
  })

  it('キャンセルした予定は includeCancelled のときだけ返し、更新を 409 で拒む', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const withCancelled = await api.schedules.list(MOCK_FACILITY_ID, {
      ...range,
      includeCancelled: true,
    })
    expect(withCancelled.schedules.find((s) => s.id === 'schedule-6')?.cancel).toEqual({
      reason: '利用者の体調不良',
    })
    const cancelled = await api.schedules.get(MOCK_FACILITY_ID, 'schedule-6')
    await expect(
      api.schedules.update(MOCK_FACILITY_ID, 'schedule-6', cancelled),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('作った予定を取得できる', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const created = await api.schedules.create(MOCK_FACILITY_ID, {
      kind: 'normal',
      title: '研修',
      staffId: 'staff-2',
      startsAt: '2026-10-20T15:00:00+09:00',
      endsAt: '2026-10-20T16:00:00+09:00',
      description: '',
    })
    await expect(api.schedules.get(MOCK_FACILITY_ID, created.id)).resolves.toEqual(created)
  })

  it('ほかの事業所は 403、ない予定は 404 の ApiError を投げる', async () => {
    const api = createFakeBuddyApi({ baseDate })
    await expect(api.staff.list('other-facility')).rejects.toMatchObject(
      new ApiError(403, '事業所 other-facility の操作は許可されていません'),
    )
    await expect(api.schedules.get(MOCK_FACILITY_ID, 'missing')).rejects.toHaveProperty(
      'status',
      404,
    )
  })

  it('buddy_primary の事業所は、同期の状況と確認が必要な予定を返さない', async () => {
    const api = createFakeBuddyApi({ baseDate })
    await expect(api.facilities.get(MOCK_FACILITY_ID)).resolves.toMatchObject({
      sourceMode: 'buddy_primary',
    })
    const list = await api.schedules.list(MOCK_FACILITY_ID, range)
    expect(list).toMatchObject({ sourceMode: 'buddy_primary', calendarSyncs: [], needsReview: [] })
  })

  it('google_primary の事業所は、Google カレンダーの予定と同期の状況を返し、予定の取得と書き込みを拒む', async () => {
    const api = createFakeBuddyApi({ baseDate, sourceMode: 'google_primary' })
    await expect(api.facilities.get(MOCK_FACILITY_ID)).resolves.toMatchObject({
      sourceMode: 'google_primary',
    })
    const list = await api.schedules.list(MOCK_FACILITY_ID, range)
    expect(list.schedules.every((s) => s.fromGoogleCalendar === true)).toBe(true)
    expect(list.needsReview.map((s) => s.reviewReason)).toEqual([
      'patient_not_found',
      'service_code_not_found',
      'recurrence_unsupported',
    ])
    expect(list.calendarSyncs.map((s) => s.last_status)).toEqual(['succeeded', 'failed', 'never'])
    const [first] = list.schedules
    await expect(api.schedules.get(MOCK_FACILITY_ID, first.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(api.schedules.update(MOCK_FACILITY_ID, first.id, first)).rejects.toMatchObject({
      status: 409,
      code: 'google_primary',
    })
  })
})
