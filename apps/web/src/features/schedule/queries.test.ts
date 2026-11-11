import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vite-plus/test'

import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import { MOCK_FACILITY_ID } from '#/mocks/scheduleData'

import { CALENDAR_SYNC_REFRESH_MS } from './lib/calendarSync'
import { scheduleListQueryOptions } from './queries'

const range = { from: '2026-10-20T00:00:00+09:00', to: '2026-10-21T00:00:00+09:00' }

/** 一覧を読んだ後の query に、scheduleListQueryOptions の refetchInterval を当てた値を返す。 */
const refetchIntervalAfterFetch = async (sourceMode: 'buddy_primary' | 'google_primary') => {
  const api = createFakeBuddyApi({ baseDate: new Date(2026, 9, 20), sourceMode })
  const client = new QueryClient()
  const options = scheduleListQueryOptions(api, MOCK_FACILITY_ID, range)
  await client.fetchQuery(options)
  const query = client.getQueryCache().find({ queryKey: options.queryKey })
  const interval = options.refetchInterval
  return typeof interval === 'function' ? interval(query as never) : interval
}

describe('scheduleListQueryOptions', () => {
  it('予定を Google カレンダーで管理している事業所の一覧は、同期の状況を新しく保つため読み直す', async () => {
    await expect(refetchIntervalAfterFetch('google_primary')).resolves.toBe(
      CALENDAR_SYNC_REFRESH_MS,
    )
  })

  it('予定を buddy で管理している事業所の一覧は、読み直さない', async () => {
    await expect(refetchIntervalAfterFetch('buddy_primary')).resolves.toBe(false)
  })
})
