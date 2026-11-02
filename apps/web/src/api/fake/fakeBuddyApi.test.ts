import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '../BuddyApi'
import { createFakeBuddyApi } from './fakeBuddyApi'
import { FAKE_FACILITY_ID } from './fixtures'

const baseDate = new Date(2026, 9, 20)
const range = { from: '2026-10-20T00:00:00+09:00', to: '2026-10-21T00:00:00+09:00' }

describe('createFakeBuddyApi', () => {
  it('期間と職員で予定を絞り込む', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const all = await api.schedules.list(FAKE_FACILITY_ID, range)
    const filtered = await api.schedules.list(FAKE_FACILITY_ID, { ...range, staffIds: ['staff-1'] })
    expect(all.map((s) => s.id)).toEqual(['schedule-1', 'schedule-2', 'schedule-3', 'schedule-7'])
    expect(filtered.map((s) => s.id)).toEqual(['schedule-1'])
  })

  it('翌日の期間に、前の日に始まり翌日に終わる予定を返す', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const nextDay = await api.schedules.list(FAKE_FACILITY_ID, {
      from: '2026-10-21T00:00:00+09:00',
      to: '2026-10-22T00:00:00+09:00',
    })
    expect(nextDay.map((s) => s.id)).toContain('schedule-7')
  })

  it('キャンセルした予定は includeCancelled のときだけ返し、更新を 409 で拒む', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const withCancelled = await api.schedules.list(FAKE_FACILITY_ID, {
      ...range,
      includeCancelled: true,
    })
    expect(withCancelled.find((s) => s.id === 'schedule-6')?.cancel).toEqual({
      reason: '利用者の体調不良',
    })
    const cancelled = await api.schedules.get(FAKE_FACILITY_ID, 'schedule-6')
    await expect(
      api.schedules.update(FAKE_FACILITY_ID, 'schedule-6', cancelled),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('作った予定を取得できる', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const created = await api.schedules.create(FAKE_FACILITY_ID, {
      kind: 'normal',
      title: '研修',
      staffId: 'staff-2',
      startsAt: '2026-10-20T15:00:00+09:00',
      endsAt: '2026-10-20T16:00:00+09:00',
      description: '',
    })
    await expect(api.schedules.get(FAKE_FACILITY_ID, created.id)).resolves.toEqual(created)
  })

  it('ほかの事業所は 403、ない予定は 404 の ApiError を投げる', async () => {
    const api = createFakeBuddyApi({ baseDate })
    await expect(api.staff.list('other-facility')).rejects.toMatchObject(
      new ApiError(403, '事業所 other-facility の操作は許可されていません'),
    )
    await expect(api.schedules.get(FAKE_FACILITY_ID, 'missing')).rejects.toHaveProperty(
      'status',
      404,
    )
  })
})
