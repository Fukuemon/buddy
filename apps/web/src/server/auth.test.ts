// @vitest-environment node
import { describe, expect, it, vi } from 'vite-plus/test'

import {
  finishLogin,
  logout,
  readCookie,
  readSession,
  safeReturnTo,
  startLogin,
  type AuthDeps,
  type Session,
} from './auth'
import { GrantRejectedError, type OidcClient } from './oidc'
import { createMemorySessionStore } from './sessionStore'
import { signValue } from './signedValue'

const SECRET = 'x'.repeat(32)
const VIEWER = { staffId: 'staff-1', staffName: '青木 陽菜', facilityId: 'facility-1' }

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
    fetchMe: async () => ({ ok: true, viewer: { ...VIEWER, canManageStaff: false } }),
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

describe('readSession', () => {
  const withSession = async (session: Session, deps: AuthDeps) => {
    await deps.store.set('session:id-1', session, 60)
    return new Request('http://web.test/', {
      headers: { Cookie: `buddy_session=${encodeURIComponent(signValue('id-1', SECRET))}` },
    })
  }

  it('署名の誤った cookie は読まない', async () => {
    const { deps } = setup()
    await deps.store.set('session:id-1', { ...VIEWER, accessToken: 'a' }, 60)
    const forged = new Request('http://web.test/', {
      headers: { Cookie: `buddy_session=${signValue('id-1', 'y'.repeat(32))}` },
    })
    expect(await readSession(forged, deps)).toBeUndefined()
  })

  it('期限が近い access token は refresh token で取り直して置き直す', async () => {
    const { deps } = setup()
    const req = await withSession(
      {
        ...VIEWER,
        accessToken: 'old',
        refreshToken: 'refresh-1',
        expiresAt: 1_000_000 + 30_000,
        idToken: 'id-1',
      },
      deps,
    )
    // 更新で Hydra が ID token を返さなければ、前の ID token をログアウトに使う
    expect(await readSession(req, deps)).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-1',
      idToken: 'id-1',
    })
    expect(await deps.store.get('session:id-1')).toMatchObject({ accessToken: 'access-2' })
  })

  it('更新で Hydra が ID token を返したら、新しい ID token に置き換える', async () => {
    const { deps } = setup({
      oidc: fakeOidc({
        refresh: async () => ({ accessToken: 'access-2', expiresIn: 3600, idToken: 'id-2' }),
      }),
    })
    const req = await withSession(
      {
        ...VIEWER,
        accessToken: 'old',
        refreshToken: 'r',
        expiresAt: 1_000_000 + 30_000,
        idToken: 'id-1',
      },
      deps,
    )
    expect((await readSession(req, deps))?.idToken).toBe('id-2')
  })

  it('同じセッションの取り直しを 1 本にまとめる', async () => {
    const refresh = vi.fn<OidcClient['refresh']>(async () => ({
      accessToken: 'access-2',
      expiresIn: 3600,
    }))
    const { deps } = setup({ oidc: fakeOidc({ refresh }) })
    const req = await withSession(
      { ...VIEWER, accessToken: 'old', refreshToken: 'r', expiresAt: 1_000_000 + 30_000 },
      deps,
    )
    const results = await Promise.all([readSession(req, deps), readSession(req, deps)])
    expect(results.map((s) => s?.accessToken)).toEqual(['access-2', 'access-2'])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(await deps.store.get('refresh-lock:id-1')).toBeUndefined()
  })

  it('ほかのプロセスが取り直している間は、置かれた値を待って使う', async () => {
    const refresh = vi.fn<OidcClient['refresh']>()
    const { deps } = setup({ oidc: fakeOidc({ refresh }) })
    const req = await withSession(
      { ...VIEWER, accessToken: 'old', refreshToken: 'r', expiresAt: 1_000_000 + 30_000 },
      deps,
    )
    await deps.store.lock('refresh-lock:id-1', 1000)
    deps.wait = async () => {
      await deps.store.set(
        'session:id-1',
        { ...VIEWER, accessToken: 'by-other', refreshToken: 'r2' },
        60,
      )
    }
    expect((await readSession(req, deps))?.accessToken).toBe('by-other')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('鍵を取る前にほかのリクエストが取り直し終えていたら、古い refresh token を送らない', async () => {
    const refresh = vi.fn<OidcClient['refresh']>()
    const { deps } = setup({ oidc: fakeOidc({ refresh }) })
    const req = await withSession(
      { ...VIEWER, accessToken: 'old', refreshToken: 'r', expiresAt: 1_000_000 + 30_000 },
      deps,
    )
    const get = deps.store.get.bind(deps.store)
    let reads = 0
    deps.store.get = async <T>(key: string) => {
      reads++
      // readSession の 1 回目の読み取りの後に、ほかのリクエストが取り直し終えたとする
      if (reads === 2) {
        await deps.store.set(
          'session:id-1',
          { ...VIEWER, accessToken: 'by-other', refreshToken: 'r2' },
          60,
        )
      }
      return get<T>(key)
    }
    expect((await readSession(req, deps))?.accessToken).toBe('by-other')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('鍵が放されたら待つのをやめる', async () => {
    const { deps } = setup()
    const req = await withSession(
      { ...VIEWER, accessToken: 'old', refreshToken: 'r', expiresAt: 1_000_000 + 30_000 },
      deps,
    )
    const token = await deps.store.lock('refresh-lock:id-1', 1000)
    let waits = 0
    deps.wait = async () => {
      waits++
      await deps.store.unlock('refresh-lock:id-1', token as string)
    }
    expect((await readSession(req, deps))?.accessToken).toBe('old')
    expect(waits).toBe(1)
  })

  it('取り直しの間にセッションが消えたら、置き直さない', async () => {
    const { deps } = setup({
      oidc: fakeOidc({
        refresh: async () => {
          await deps.store.delete('session:id-1')
          return { accessToken: 'access-2', expiresIn: 3600 }
        },
      }),
    })
    const req = await withSession(
      { ...VIEWER, accessToken: 'old', refreshToken: 'r', expiresAt: 1_000_000 + 30_000 },
      deps,
    )
    expect(await readSession(req, deps)).toBeUndefined()
    expect(await deps.store.get('session:id-1')).toBeUndefined()
  })

  it('通信の失敗ではセッションを消さず、まだ使える token を返す', async () => {
    const { deps } = setup({
      oidc: fakeOidc({
        refresh: async () => {
          throw new Error('ECONNRESET')
        },
      }),
    })
    const req = await withSession(
      { ...VIEWER, accessToken: 'old', refreshToken: 'r', expiresAt: 1_000_000 + 30_000 },
      deps,
    )
    expect((await readSession(req, deps))?.accessToken).toBe('old')
    expect(await deps.store.get('session:id-1')).toBeDefined()
  })

  it('refresh token を拒まれたらセッションを消す', async () => {
    const { deps } = setup({
      oidc: fakeOidc({
        refresh: async () => {
          throw new GrantRejectedError()
        },
      }),
    })
    const req = await withSession(
      { ...VIEWER, accessToken: 'old', refreshToken: 'r', expiresAt: 1_000_000 - 1 },
      deps,
    )
    expect(await readSession(req, deps)).toBeUndefined()
    expect(await deps.store.get('session:id-1')).toBeUndefined()
  })

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

describe('readCookie', () => {
  it('名前の一致する cookie だけを読む', () => {
    expect(readCookie('a=1; buddy_session=x%2Ey; b=2', 'buddy_session')).toBe('x.y')
    expect(readCookie(null, 'buddy_session')).toBeUndefined()
    expect(readCookie('buddy_session=%E0', 'buddy_session')).toBeUndefined()
  })
})
