import { randomBytes } from 'node:crypto'

import type { Viewer } from '#/api/types'

import {
  GrantRejectedError,
  codeChallengeOf,
  randomCodeVerifier,
  randomNonce,
  randomState,
  type OidcClient,
  type Tokens,
} from './oidc'
import type { SessionStore } from './sessionStore'
import { signValue, verifySignedValue } from './signedValue'

/** Valkey に置くセッション。トークンはブラウザに渡さない。 */
export type Session = Viewer & {
  accessToken: string
  refreshToken?: string
  /** access token の期限の UNIX 時刻（ミリ秒）。分からなければ undefined。 */
  expiresAt?: number
}

type LoginTransaction = { codeVerifier: string; nonce: string; returnTo: string }

/** GET /v1/me の結果。forbidden は、事業所に登録されていない職員である。 */
export type MeResult = { ok: true; viewer: Viewer } | { ok: false; reason: 'forbidden' | 'failed' }

export type AuthDeps = {
  store: SessionStore
  oidc: OidcClient
  secret: string
  /** cookie に Secure を付けるか。 */
  secureCookie: boolean
  /** access token の職員を予定の API の GET /v1/me で引く。 */
  fetchMe: (accessToken: string) => Promise<MeResult>
  now?: () => number
  /** ほかの要求が取り直すのを待つときに使う。テストで替える。 */
  wait?: (ms: number) => Promise<void>
}

export const SESSION_COOKIE = 'buddy_session'
const LOGIN_COOKIE = 'buddy_login'
const SESSION_TTL_SECONDS = 12 * 60 * 60
const LOGIN_TTL_SECONDS = 10 * 60
/** 期限まで、この長さを切った access token は、使う前に取り直す。 */
const REFRESH_MARGIN_MS = 60 * 1000
/** 取り直しの鍵を持つ長さ。ブローカーの応答を待つ上限より長くする。 */
const REFRESH_LOCK_MS = 10 * 1000
/** ほかの要求の取り直しを待つ間隔と回数。 */
const REFRESH_POLL_MS = 200
const REFRESH_POLL_TIMES = 25

const sessionKey = (id: string) => `session:${id}`
const loginKey = (state: string) => `login:${state}`
const refreshLockKey = (id: string) => `refresh-lock:${id}`
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Cookie のヘッダーから name の値を取り出す。値を読めなければ undefined を返す。 */
export const readCookie = (header: string | null, name: string) => {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key !== name) continue
    try {
      return decodeURIComponent(rest.join('='))
    } catch {
      return undefined
    }
  }
  return undefined
}

const cookie = (deps: AuthDeps, name: string, value: string, maxAge: number) => {
  const secure = deps.secureCookie ? '; Secure' : ''
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers })
}

const RETURN_TO_BASE = 'http://return-to.invalid'

/**
 * ログインの後に戻る先を、同じオリジンのパスに限る。ほかは / にする。
 *
 * URL の解析はタブと改行を取り除き `\` を `/` とみなすので、文字列の前方の一致では `/\t/evil.example` を通してしまう。
 * 解析した結果のオリジンで比べ、解析した後のパスを返す。
 */
export const safeReturnTo = (value: string | null) => {
  if (value === null || !value.startsWith('/')) return '/'
  try {
    const url = new URL(value, RETURN_TO_BASE)
    return url.origin === RETURN_TO_BASE ? url.pathname + url.search + url.hash : '/'
  } catch {
    return '/'
  }
}

const expiresAtOf = (tokens: Tokens, now: number) =>
  tokens.expiresIn === undefined ? undefined : now + tokens.expiresIn * 1000

/** GET /auth/login。ブラウザをブローカーの認可の画面へ転送する。クエリの returnTo はログインの後に戻る先である。 */
export const startLogin = async (request: Request, deps: AuthDeps): Promise<Response> => {
  const url = new URL(request.url)
  const state = randomState()
  const nonce = randomNonce()
  const codeVerifier = randomCodeVerifier()
  const tx: LoginTransaction = {
    codeVerifier,
    nonce,
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
  }
  await deps.store.set(loginKey(state), tx, LOGIN_TTL_SECONDS)
  const authorizationUrl = deps.oidc.authorizationUrl({
    redirectUri: new URL('/auth/callback', url).toString(),
    state,
    nonce,
    codeChallenge: await codeChallengeOf(codeVerifier),
  })
  return redirect(authorizationUrl.toString(), [
    cookie(deps, LOGIN_COOKIE, signValue(state, deps.secret), LOGIN_TTL_SECONDS),
  ])
}

/**
 * GET /auth/callback。認可コードをトークンに替え、職員を引いてセッションを作り、戻る先へ転送する。
 *
 * state が cookie と合わない、ログインの途中の値が無い、トークンを取れない、のいずれかで /auth/error?reason=failed へ、
 * 職員が事業所に登録されていなければ /auth/error?reason=forbidden へ転送する。
 */
export const finishLogin = async (request: Request, deps: AuthDeps): Promise<Response> => {
  const url = new URL(request.url)
  const clearLogin = cookie(deps, LOGIN_COOKIE, '', 0)
  const fail = (reason: 'failed' | 'forbidden', cause: string) => {
    console.warn(JSON.stringify({ msg: 'login failed', reason, cause }))
    return redirect(`/auth/error?reason=${reason}`, [clearLogin])
  }
  const state = url.searchParams.get('state')
  const cookieState = verifySignedValue(
    readCookie(request.headers.get('Cookie'), LOGIN_COOKIE),
    deps.secret,
  )
  if (state === null || state !== cookieState) return fail('failed', 'state mismatch')
  const tx = await deps.store.take<LoginTransaction>(loginKey(state))
  if (tx === undefined) return fail('failed', 'login transaction not found')
  let tokens: Tokens
  try {
    tokens = await deps.oidc.exchangeCode(url, {
      codeVerifier: tx.codeVerifier,
      state,
      nonce: tx.nonce,
    })
  } catch (error) {
    return fail(
      'failed',
      `token exchange: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const me = await deps.fetchMe(tokens.accessToken)
  if (!me.ok) return fail(me.reason, 'GET /v1/me')
  const previous = sessionIdOf(request, deps.secret)
  if (previous !== undefined) await deps.store.delete(sessionKey(previous))
  const id = randomBytes(32).toString('base64url')
  const session: Session = {
    ...me.viewer,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: expiresAtOf(tokens, (deps.now ?? Date.now)()),
  }
  await deps.store.set(sessionKey(id), session, SESSION_TTL_SECONDS)
  return redirect(tx.returnTo, [
    clearLogin,
    cookie(deps, SESSION_COOKIE, signValue(id, deps.secret), SESSION_TTL_SECONDS),
  ])
}

/** POST /auth/logout。セッションを消して / へ転送する。ブローカーのセッションは消さない。 */
export const logout = async (request: Request, deps: AuthDeps): Promise<Response> => {
  const id = sessionIdOf(request, deps.secret)
  if (id !== undefined) await deps.store.delete(sessionKey(id))
  return redirect('/', [cookie(deps, SESSION_COOKIE, '', 0)])
}

const sessionIdOf = (request: Request, secret: string) =>
  verifySignedValue(readCookie(request.headers.get('Cookie'), SESSION_COOKIE), secret)

/**
 * 要求の cookie のセッションを返す。access token の期限が近ければ refresh token で取り直して置き直す。
 *
 * セッションが無いとき、期限が切れて取り直せないときは undefined を返す。ブローカーが refresh token を拒んだときだけ、
 * セッションを消す。通信の失敗では消さず、access token がまだ使えればそれを返し、使えなければ投げる。
 */
export const readSession = async (
  request: Request,
  deps: AuthDeps,
): Promise<Session | undefined> => {
  const id = sessionIdOf(request, deps.secret)
  if (id === undefined) return undefined
  const session = await deps.store.get<Session>(sessionKey(id))
  if (session === undefined) return undefined
  const now = (deps.now ?? Date.now)()
  if (session.expiresAt === undefined || session.expiresAt - REFRESH_MARGIN_MS > now) return session
  if (session.refreshToken === undefined) return session.expiresAt > now ? session : undefined
  return refreshOnce(id, session, now, deps)
}

/** 同じプロセスの中で、同じセッションの取り直しを 1 本にまとめる。 */
const inFlight = new Map<string, Promise<Session | undefined>>()

const refreshOnce = (id: string, session: Session, now: number, deps: AuthDeps) => {
  const running = inFlight.get(id)
  if (running !== undefined) return running
  const refreshing = refresh(id, session, now, deps).finally(() => inFlight.delete(id))
  inFlight.set(id, refreshing)
  return refreshing
}

/**
 * Valkey の鍵で、ほかのプロセスとも取り直しを 1 本にする。refresh token を回すブローカーは、使い回しを拒むためである。
 * 鍵を取れなかった要求は、取り直した値が置かれるのを待つ。
 */
const refresh = async (
  id: string,
  session: Session,
  now: number,
  deps: AuthDeps,
): Promise<Session | undefined> => {
  const stillValid = session.expiresAt !== undefined && session.expiresAt > now
  if (!(await deps.store.lock(refreshLockKey(id), REFRESH_LOCK_MS))) {
    for (let i = 0; i < REFRESH_POLL_TIMES; i++) {
      await (deps.wait ?? sleep)(REFRESH_POLL_MS)
      const latest = await deps.store.get<Session>(sessionKey(id))
      if (latest === undefined) return undefined
      if (latest.accessToken !== session.accessToken) return latest
    }
    return stillValid ? session : undefined
  }
  try {
    const tokens = await deps.oidc.refresh(session.refreshToken as string)
    const refreshed: Session = {
      ...session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? session.refreshToken,
      expiresAt: expiresAtOf(tokens, now),
    }
    return (await deps.store.replace(sessionKey(id), refreshed)) ? refreshed : undefined
  } catch (error) {
    if (error instanceof GrantRejectedError) {
      await deps.store.delete(sessionKey(id))
      return undefined
    }
    if (stillValid) return session
    throw error
  } finally {
    await deps.store.delete(refreshLockKey(id))
  }
}

/** Session から、画面に渡してよい値だけを取り出す。 */
export const viewerOf = ({ staffId, staffName, facilityId }: Session): Viewer => ({
  staffId,
  staffName,
  facilityId,
})
