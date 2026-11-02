// @vitest-environment node
import { describe, expect, it, vi } from 'vite-plus/test'

import {
  finishLogin,
  logout,
  readViewer,
  safeReturnTo,
  startLogin,
  viewerOf,
  type AuthDeps,
} from './auth'
import type { OidcClient } from './oidc'
import { readSession, type Session } from './session'
import { createMemorySessionStore } from './sessionStore'
import { signValue } from './signedValue'

const SECRET = 'x'.repeat(32)
const VIEWER = {
  staffId: 'staff-1',
  staffName: '青木 陽菜',
  facilityId: 'facility-1',
  canManageStaff: false,
  canCheckReceipt: false,
  schedulePolicies: [],
}

const fakeOidc = (overrides: Partial<OidcClient> = {}): OidcClient => ({
  authorizationUrl: ({ redirectUri, state, prompt }) =>
    new URL(
      `http://idp.test/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}${prompt === undefined ? '' : `&prompt=${prompt}`}`,
    ),
  exchangeCode: async () => ({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresIn: 3600,
    idToken: 'id-1',
  }),
  refresh: async () => ({ accessToken: 'access-2', expiresIn: 3600 }),
  endSessionUrl: ({ idTokenHint, postLogoutRedirectUri }) =>
    new URL(
      `http://idp.test/logout?id_token_hint=${idTokenHint}&post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`,
    ),
  ...overrides,
})

const setup = (overrides: Partial<AuthDeps> = {}) => {
  const store = createMemorySessionStore()
  const deps: AuthDeps = {
    store,
    oidc: fakeOidc(),
    secret: SECRET,
    secureCookie: false,
    fetchMe: async () => ({
      ok: true,
      viewer: { ...VIEWER, canManageStaff: false, canCheckReceipt: false, schedulePolicies: [] },
    }),
    now: () => 1_000_000,
    wait: async () => {},
    ...overrides,
  }
  return { store, deps }
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

/** ログインを始め、IdP から戻ったコールバックまでを流す。 */
const login = async (deps: AuthDeps, returnTo = '/schedule') => {
  const start = await startLogin(
    new Request(`http://web.test/auth/login?returnTo=${encodeURIComponent(returnTo)}`),
    deps,
  )
  const state = new URL(start.headers.get('Location') ?? '').searchParams.get('state')
  return finishLogin(
    new Request(`http://web.test/auth/callback?code=c&state=${state}`, {
      headers: { Cookie: cookiesOf(start) },
    }),
    deps,
  )
}

describe('ログイン', () => {
  it('IdP へリダイレクトし、コールバックでセッションを作って戻る先へリダイレクトする', async () => {
    const start = await startLogin(
      new Request('http://web.test/auth/login?returnTo=/schedule'),
      setup().deps,
    )
    const location = new URL(start.headers.get('Location') ?? '')
    expect(location.searchParams.get('redirect_uri')).toBe('http://web.test/auth/callback')

    const { store, deps } = setup()
    const done = await login(deps)
    expect(done.status).toBe(302)
    expect(done.headers.get('Location')).toBe('/schedule')
    const setCookie = done.headers.getSetCookie().find((c) => c.startsWith('buddy_session='))
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).not.toContain('access-1')
    const session = await readSession(
      new Request('http://web.test/', { headers: { Cookie: cookiesOf(done) } }),
      deps,
    )
    expect(session).toMatchObject({ ...VIEWER, accessToken: 'access-1', idToken: 'id-1' })
    expect([...store.values.keys()].filter((k) => k.startsWith('login:'))).toEqual([])
  })

  it('prompt=login のときだけ、Hydra に prompt=login を渡す', async () => {
    const { deps } = setup()
    const promptOf = async (query: string) =>
      new URL(
        (await startLogin(new Request(`http://web.test/auth/login${query}`), deps)).headers.get(
          'Location',
        ) ?? '',
      ).searchParams.get('prompt')
    expect(await promptOf('?prompt=login')).toBe('login')
    expect(await promptOf('?prompt=none')).toBeNull()
    expect(await promptOf('')).toBeNull()
  })

  it('secureCookie なら cookie に Secure を付ける', async () => {
    const { deps } = setup({ secureCookie: true })
    const start = await startLogin(new Request('http://web.test/auth/login'), deps)
    expect(start.headers.getSetCookie()[0]).toContain('Secure')
  })

  it('もう一度ログインすると前のセッションを消す', async () => {
    const { store, deps } = setup()
    const first = await login(deps)
    const start = await startLogin(
      new Request('http://web.test/auth/login', { headers: { Cookie: cookiesOf(first) } }),
      deps,
    )
    const state = new URL(start.headers.get('Location') ?? '').searchParams.get('state')
    await finishLogin(
      new Request(`http://web.test/auth/callback?code=c&state=${state}`, {
        headers: { Cookie: `${cookiesOf(first)}; ${cookiesOf(start)}` },
      }),
      deps,
    )
    expect([...store.values.keys()].filter((k) => k.startsWith('session:'))).toHaveLength(1)
  })

  it('state が cookie と違えば、トークンを取らずに失敗へリダイレクトする', async () => {
    const exchangeCode = vi.fn<OidcClient['exchangeCode']>()
    const { deps } = setup({ oidc: fakeOidc({ exchangeCode }) })
    const start = await startLogin(new Request('http://web.test/auth/login'), deps)
    const res = await finishLogin(
      new Request('http://web.test/auth/callback?code=c&state=other', {
        headers: { Cookie: cookiesOf(start) },
      }),
      deps,
    )
    expect(res.headers.get('Location')).toBe('/auth/error?reason=failed')
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('事業所に登録されていない職員は forbidden へリダイレクトし、セッションを作らない', async () => {
    const { store, deps } = setup({ fetchMe: async () => ({ ok: false, reason: 'forbidden' }) })
    const res = await login(deps)
    expect(res.headers.get('Location')).toBe('/auth/error?reason=forbidden')
    expect([...store.values.keys()].some((k) => k.startsWith('session:'))).toBe(false)
  })

  it('ブローカーが試行の回数の上限で拒んだら、トークンを取らずに too_many_attempts へリダイレクトする', async () => {
    const exchangeCode = vi.fn<OidcClient['exchangeCode']>()
    const { store, deps } = setup({ oidc: fakeOidc({ exchangeCode }) })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const start = await startLogin(new Request('http://web.test/auth/login'), deps)
    const state = new URL(start.headers.get('Location') ?? '').searchParams.get('state')
    const res = await finishLogin(
      new Request(`http://web.test/auth/callback?error=temporarily_unavailable&state=${state}`, {
        headers: { Cookie: cookiesOf(start) },
      }),
      deps,
    )
    expect(res.headers.get('Location')).toBe('/auth/error?reason=too_many_attempts')
    expect(exchangeCode).not.toHaveBeenCalled()
    expect([...store.values.keys()].some((k) => k.startsWith('login:'))).toBe(false)
  })

  it('トークンを取れなければ failed へリダイレクトする', async () => {
    const { deps } = setup({
      oidc: fakeOidc({
        exchangeCode: async () => {
          throw new Error('invalid_grant')
        },
      }),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await login(deps)).headers.get('Location')).toBe('/auth/error?reason=failed')
  })

  it('戻る先はほかのオリジンにしない', () => {
    expect(safeReturnTo('/schedule?date=2026-10-21')).toBe('/schedule?date=2026-10-21')
    expect(safeReturnTo('/schedule/../auth/error')).toBe('/auth/error')
    for (const bad of [
      null,
      'http://evil.test/',
      '//evil.test/',
      '/\\evil.test',
      '/\t/evil.test',
      '/\n/evil.test',
      '/\r\n/evil.test',
      '/.//evil.test',
      '/..//evil.test',
      '/a/..//evil.test',
      '/%2e//evil.test',
      '/./\\evil.test',
    ]) {
      expect(safeReturnTo(bad)).toBe('/')
    }
  })
})

describe('ログアウト', () => {
  const withSession = async (session: Session, deps: AuthDeps) => {
    await deps.store.set('session:id-1', session, 60)
    return new Request('http://web.test/', {
      headers: { Cookie: `buddy_session=${encodeURIComponent(signValue('id-1', SECRET))}` },
    })
  }

  it('ログアウトでセッションと cookie を消し、ID token を添えて Hydra のログアウトへリダイレクトする', async () => {
    const { deps } = setup()
    const req = await withSession({ ...VIEWER, accessToken: 'a', idToken: 'id-1' }, deps)
    const res = await logout(req, deps)
    const location = new URL(res.headers.get('Location') ?? '')
    expect(location.origin + location.pathname).toBe('http://idp.test/logout')
    expect(location.searchParams.get('id_token_hint')).toBe('id-1')
    expect(location.searchParams.get('post_logout_redirect_uri')).toBe('http://web.test/')
    expect(res.headers.getSetCookie()[0]).toContain('Max-Age=0')
    expect(await deps.store.get('session:id-1')).toBeUndefined()
  })

  it('ID token の無い古いセッションのログアウトは、セッションを消して / へリダイレクトする', async () => {
    const { deps } = setup()
    const req = await withSession({ ...VIEWER, accessToken: 'a' }, deps)
    const res = await logout(req, deps)
    expect(res.headers.get('Location')).toBe('/')
    expect(res.headers.getSetCookie()[0]).toContain('Max-Age=0')
    expect(await deps.store.get('session:id-1')).toBeUndefined()
  })

  it('セッションが無くてもログアウトは / へリダイレクトする', async () => {
    const res = await logout(new Request('http://web.test/auth/logout'), setup().deps)
    expect(res.headers.get('Location')).toBe('/')
  })
})

describe('viewerOf', () => {
  it('セッションから、トークンを除いて職員と権限の値をそのまま返す', () => {
    const session: Session = {
      ...VIEWER,
      canManageStaff: true,
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: 1,
      idToken: 'id',
    }
    expect(viewerOf(session)).toEqual({ ...VIEWER, canManageStaff: true })
  })
})

describe('readViewer', () => {
  const requestWith = async (deps: AuthDeps) => {
    await deps.store.set('session:id-1', { ...VIEWER, accessToken: 'at' } satisfies Session, 60)
    return new Request('http://web.test/', {
      headers: { Cookie: `buddy_session=${encodeURIComponent(signValue('id-1', SECRET))}` },
    })
  }

  it('ログインの後に変えた権限を、GET /v1/me から読み直す', async () => {
    const fetchMe = vi.fn<AuthDeps['fetchMe']>(async () => ({
      ok: true,
      viewer: { ...VIEWER, canManageStaff: true, canCheckReceipt: true, schedulePolicies: [] },
    }))
    const { deps } = setup({ fetchMe })
    expect(await readViewer(await requestWith(deps), deps)).toEqual({
      ...VIEWER,
      canManageStaff: true,
      canCheckReceipt: true,
      schedulePolicies: [],
    })
    expect(fetchMe).toHaveBeenCalledWith('at')
  })

  it('GET /v1/me が失敗したとき、届かないときは、セッションの値を返す', async () => {
    for (const fetchMe of [
      async () => ({ ok: false, reason: 'failed' }) as const,
      async () => Promise.reject(new Error('connect ECONNREFUSED')),
    ]) {
      const { deps } = setup({ fetchMe })
      expect(await readViewer(await requestWith(deps), deps)).toEqual(VIEWER)
    }
  })

  it('ログインしていなければ null を返し、GET /v1/me を呼ばない', async () => {
    const fetchMe = vi.fn<AuthDeps['fetchMe']>()
    const { deps } = setup({ fetchMe })
    expect(await readViewer(new Request('http://web.test/'), deps)).toBeNull()
    expect(fetchMe).not.toHaveBeenCalled()
  })
})
