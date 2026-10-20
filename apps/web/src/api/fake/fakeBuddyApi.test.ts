import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '../client'
import { createFakeBuddyApi } from './fakeBuddyApi'
import { FAKE_FACILITY_ID } from './fixtures'

const baseDate = new Date(2026, 9, 20)
const range = { from: '2026-10-20T00:00:00+09:00', to: '2026-10-21T00:00:00+09:00' }

describe('createFakeBuddyApi', () => {
  it('期間と職員で予定を絞り込む', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const all = await api.schedules.list(FAKE_FACILITY_ID, range)
    const filtered = await api.schedules.list(FAKE_FACILITY_ID, { ...range, staffIds: ['staff-1'] })
    expect(all.map((s) => s.id)).toEqual(['schedule-1', 'schedule-2', 'schedule-3'])
    expect(filtered.map((s) => s.id)).toEqual(['schedule-1'])
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
