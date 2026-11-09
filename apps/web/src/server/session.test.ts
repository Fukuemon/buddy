// @vitest-environment node
import { describe, expect, it, vi } from 'vite-plus/test'

import { GrantRejectedError, type OidcClient } from './oidc'
import { readCookie, readSession, type Session, type SessionDeps } from './session'
import { createMemorySessionStore } from './sessionStore'
import { signValue } from './signedValue'

const SECRET = 'x'.repeat(32)
const VIEWER = {
  staffId: 'staff-1',
  staffName: '青木 陽菜',
  facilityId: 'facility-1',
  policyCodes: [],
  schedulePolicies: [],
}

const fakeOidc = (overrides: Partial<OidcClient> = {}): OidcClient => ({
  authorizationUrl: () => new URL('http://idp.test/authorize'),
  exchangeCode: async () => ({ accessToken: 'access-1' }),
  refresh: async () => ({ accessToken: 'access-2', expiresIn: 3600 }),
  endSessionUrl: () => new URL('http://idp.test/logout'),
  ...overrides,
})

const setup = (overrides: Partial<SessionDeps> = {}) => {
  const deps: SessionDeps = {
    store: createMemorySessionStore(),
    oidc: fakeOidc(),
    secret: SECRET,
    now: () => 1_000_000,
    wait: async () => {},
    ...overrides,
  }
  return { deps }
}

describe('readSession', () => {
  const withSession = async (session: Session, deps: SessionDeps) => {
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

  it('期限が近い access token は refresh token で更新して置き直す', async () => {
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

  it('同じセッションの更新を 1 本にまとめる', async () => {
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

  it('ほかのプロセスが更新している間は、置かれた値を待って使う', async () => {
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

  it('鍵を取る前にほかのリクエストが更新し終えていたら、古い refresh token を送らない', async () => {
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
      // readSession の 1 回目の読み取りの後に、ほかのリクエストが更新終えたとする
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

  it('更新の間にセッションが消えたら、置き直さない', async () => {
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
})

describe('readCookie', () => {
  it('名前の一致する cookie だけを読む', () => {
    expect(readCookie('a=1; buddy_session=x%2Ey; b=2', 'buddy_session')).toBe('x.y')
    expect(readCookie(null, 'buddy_session')).toBeUndefined()
    expect(readCookie('buddy_session=%E0', 'buddy_session')).toBeUndefined()
  })
})
