// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import type { AuthDeps } from './auth'
import { callBff } from './bff'
import { createMemorySessionStore } from './sessionStore'
import { signValue } from './signedValue'

const SECRET = 'x'.repeat(32)

const setup = async () => {
  const store = createMemorySessionStore()
  await store.set('session:id-1', {
    staffId: 'staff-1',
    staffName: '青木 陽菜',
    facilityId: 'facility-1',
    accessToken: 'access-1',
  })
  const auth: AuthDeps = {
    store,
    secret: SECRET,
    oidc: {} as AuthDeps['oidc'],
    fetchMe: async () => ({ ok: false, reason: 'failed' }),
  }
  const requests: Request[] = []
  const fetch = async (input: RequestInfo | URL) => {
    const request = input as Request
    requests.push(request)
    if (new URL(request.url).pathname === '/v1/facilities/facility-1/teams') {
      return Response.json([{ id: 'team-a', name: 'A' }])
    }
    return Response.json(
      { code: 'forbidden', message: 'この操作は許可されていません' },
      { status: 403 },
    )
  }
  return { auth, fetch, requests }
}

const withCookie = (cookie?: string) =>
  new Request('http://web.test/_serverFn', cookie ? { headers: { Cookie: cookie } } : {})

describe('callBff', () => {
  it('セッションの token と事業所で予定の API を呼ぶ', async () => {
    const { auth, fetch, requests } = await setup()
    const result = await callBff(
      withCookie(`buddy_session=${signValue('id-1', SECRET)}`),
      { op: 'teams.list', args: ['facility-other'] },
      { auth, scheduleApiUrl: 'http://api.test', fetch },
    )
    expect(result).toEqual({ ok: true, data: [{ id: 'team-a', name: 'A' }] })
    expect(requests[0].headers.get('Authorization')).toBe('Bearer access-1')
  })

  it('API の失敗は status と文を値で返す', async () => {
    const { auth, fetch } = await setup()
    const result = await callBff(
      withCookie(`buddy_session=${signValue('id-1', SECRET)}`),
      { op: 'schedules.get', args: ['facility-1', 'x'] },
      { auth, scheduleApiUrl: 'http://api.test', fetch },
    )
    expect(result).toEqual({ ok: false, status: 403, message: 'この操作は許可されていません' })
  })

  it('セッションが無ければ 401 を返し、API を呼ばない', async () => {
    const { auth, fetch, requests } = await setup()
    const result = await callBff(
      withCookie(),
      { op: 'teams.list', args: ['facility-1'] },
      {
        auth,
        scheduleApiUrl: 'http://api.test',
        fetch,
      },
    )
    expect(result).toMatchObject({ ok: false, status: 401 })
    expect(requests).toHaveLength(0)
  })
})
