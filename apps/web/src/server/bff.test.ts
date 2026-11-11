// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vite-plus/test'

import { scheduleHttp, server, TEST_SCHEDULE_URL } from '#/test/server'

import type { AuthDeps } from './auth'
import { callBff } from './bff'
import { createMemorySessionStore } from './sessionStore'
import { signValue } from './signedValue'

const SECRET = 'x'.repeat(32)

const setup = async () => {
  const store = createMemorySessionStore()
  await store.set(
    'session:id-1',
    {
      staffId: 'staff-1',
      staffName: '青木 陽菜',
      facilityId: 'facility-1',
      accessToken: 'access-1',
    },
    60,
  )
  const auth: AuthDeps = {
    store,
    secret: SECRET,
    usesSecureCookie: false,
    oidc: {} as AuthDeps['oidc'],
    getMe: async () => ({ ok: false, reason: 'failed' }),
  }
  return { auth, scheduleApiUrl: TEST_SCHEDULE_URL }
}

const withCookie = (cookie?: string) =>
  new Request('http://web.test/_serverFn', cookie ? { headers: { Cookie: cookie } } : {})

const signedIn = () => withCookie(`buddy_session=${signValue('id-1', SECRET)}`)

/** 予定の API への全てのリクエストに 500 を返す。呼ばれるとテストの期待と食い違う。 */
const mustNotCall = () =>
  http.all(`${TEST_SCHEDULE_URL}/*`, () =>
    HttpResponse.json({ code: 'internal', message: '呼ばれてはいけない' }, { status: 500 }),
  )

describe('callBff', () => {
  it('セッションの token と事業所で予定の API を呼ぶ', async () => {
    server.use(
      scheduleHttp.get('/v1/facilities/{facility_id}/teams', ({ params, request, response }) =>
        params.facility_id === 'facility-1' &&
        request.headers.get('Authorization') === 'Bearer access-1'
          ? response(200).json([
              {
                id: 'team-a',
                facility_id: 'facility-1',
                name: 'A',
                color: 'blue',
                created_at: '2026-10-01T00:00:00Z',
                updated_at: '2026-10-01T00:00:00Z',
              },
            ])
          : response(403).json({ code: 'forbidden', message: '事業所か token が違う' }),
      ),
    )
    const result = await callBff(
      signedIn(),
      { op: 'teams.list', args: ['facility-other'] },
      await setup(),
    )
    expect(result).toEqual({ ok: true, data: [{ id: 'team-a', name: 'A', color: 'blue' }] })
  })

  it('API の失敗は status と文を値で返す', async () => {
    server.use(
      scheduleHttp.get('/v1/schedules/{schedule_id}', ({ response }) =>
        response(403).json({ code: 'forbidden', message: 'この操作は許可されていません' }),
      ),
    )
    const result = await callBff(
      signedIn(),
      { op: 'schedules.get', args: ['facility-1', 'x'] },
      await setup(),
    )
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: 'この操作は許可されていません',
      code: 'forbidden',
    })
  })

  it('引数の形が操作に合わなければ 400 を返し、API を呼ばない', async () => {
    server.use(mustNotCall())
    const result = await callBff(
      signedIn(),
      { op: 'schedules.list', args: ['facility-1'] },
      await setup(),
    )
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('セッションが無ければ 401 を返し、API を呼ばない', async () => {
    server.use(mustNotCall())
    const result = await callBff(
      withCookie(),
      { op: 'teams.list', args: ['facility-1'] },
      await setup(),
    )
    expect(result).toMatchObject({ ok: false, status: 401 })
  })

  it('ログインの期限を延ばせなければ、503 と session_unavailable を返し、API を呼ばない', async () => {
    server.use(mustNotCall())
    const deps = await setup()
    await deps.auth.store.set(
      'session:id-1',
      {
        staffId: 'staff-1',
        staffName: '青木 陽菜',
        facilityId: 'facility-1',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: Date.now() - 1000,
      },
      60,
    )
    deps.auth.oidc = {
      refresh: async () => {
        throw new TypeError('fetch failed')
      },
    } as unknown as AuthDeps['oidc']
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await callBff(signedIn(), { op: 'teams.list', args: ['facility-1'] }, deps)
    warn.mockRestore()
    expect(result).toMatchObject({ ok: false, status: 503, code: 'session_unavailable' })
  })
})
