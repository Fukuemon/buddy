import { randomBytes } from 'node:crypto'

import type { MeResult } from '#/api/http/meApi'
import type { Viewer } from '#/api/types'

import { codeChallengeOf, randomCodeVerifier, randomNonce, randomState, type Tokens } from './oidc'
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  expiresAtOf,
  readCookie,
  readSession,
  sessionIdOf,
  sessionKey,
  type Session,
  type SessionDeps,
} from './session'
import { signValue, verifySignedValue } from './signedValue'

type LoginTransaction = { codeVerifier: string; nonce: string; returnTo: string }

/** ログイン、ログアウト、セッションの処理が使う依存。 */
export type AuthDeps = SessionDeps & {
  /** cookie に Secure を付けるか。 */
  secureCookie: boolean
  /** access token の職員を予定の API の GET /v1/me で引く。 */
  fetchMe: (accessToken: string) => Promise<MeResult>
}

const LOGIN_COOKIE = 'buddy_login'
const LOGIN_TTL_SECONDS = 10 * 60
const loginKey = (state: string) => `login:${state}`

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
    const path = url.pathname + url.search + url.hash
    // `/.//evil.example` は、解析で `.` が畳まれて `//evil.example` になり、ブラウザはほかのホストとして読む
    return url.origin === RETURN_TO_BASE && !path.startsWith('//') ? path : '/'
  } catch {
    return '/'
  }
}

/**
 * GET /auth/login。ブラウザを Hydra の認可のエンドポイントへリダイレクトする。クエリの returnTo はログインの後に戻る先である。
 *
 * クエリの prompt が login なら、Hydra が保ったログインのセッションを使わずに、ブローカーのメールの入力の画面を出させる。
 * ログインの失敗の画面から入り直すときに使う。Hydra は失敗した職員のログインのセッションも保っているので、使うと同じ職員に戻ってしまう。
 */
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
    prompt: url.searchParams.get('prompt') === 'login' ? 'login' : undefined,
  })
  return redirect(authorizationUrl.toString(), [
    cookie(deps, LOGIN_COOKIE, signValue(state, deps.secret), LOGIN_TTL_SECONDS),
  ])
}

/**
 * GET /auth/callback。認可コードをトークンと交換し、職員を引いてセッションを作り、戻る先へリダイレクトする。
 *
 * state が cookie と合わない、ログインの途中の値が無い、トークンを取れない、のいずれかで /auth/error?reason=failed へ、
 * ブローカーが試行の回数の上限で拒んだ（error が temporarily_unavailable）ら /auth/error?reason=too_many_attempts へ、
 * 職員が事業所に登録されていなければ /auth/error?reason=forbidden へリダイレクトする。
 */
export const finishLogin = async (request: Request, deps: AuthDeps): Promise<Response> => {
  const url = new URL(request.url)
  const clearLogin = cookie(deps, LOGIN_COOKIE, '', 0)
  const fail = (reason: 'failed' | 'forbidden' | 'too_many_attempts', cause: string) => {
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
  // ブローカーの TooManyAttempts の reject。ほかの reject は、トークンと交換できずに failed になる
  if (url.searchParams.get('error') === 'temporarily_unavailable')
    return fail('too_many_attempts', 'broker: too many attempts')
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
    idToken: tokens.idToken,
  }
  await deps.store.set(sessionKey(id), session, SESSION_TTL_SECONDS)
  return redirect(tx.returnTo, [
    clearLogin,
    cookie(deps, SESSION_COOKIE, signValue(id, deps.secret), SESSION_TTL_SECONDS),
  ])
}

/**
 * POST /auth/logout。セッションを消し、ブラウザを Hydra の RP-Initiated Logout へリダイレクトする。
 * Hydra はブローカーのログアウトの画面を呼んでログインのセッションを消し、web の / へ戻す。
 *
 * セッションか ID token が無いときは / へリダイレクトする。ID token を置く前のセッションは、Hydra がログインのセッションを保っていない。
 */
export const logout = async (request: Request, deps: AuthDeps): Promise<Response> => {
  const id = sessionIdOf(request, deps.secret)
  const session = id === undefined ? undefined : await deps.store.get<Session>(sessionKey(id))
  if (id !== undefined) await deps.store.delete(sessionKey(id))
  const clearSession = cookie(deps, SESSION_COOKIE, '', 0)
  if (session?.idToken === undefined) return redirect('/', [clearSession])
  const endSessionUrl = deps.oidc.endSessionUrl({
    idTokenHint: session.idToken,
    postLogoutRedirectUri: new URL('/', request.url).toString(),
  })
  return redirect(endSessionUrl.toString(), [clearSession])
}

/** 全てのリクエストに、accessToken の Bearer の Authorization のヘッダーを付けて送る fetch を返す。 */
export const fetchWithAccessToken =
  (accessToken: string): typeof globalThis.fetch =>
  (input, init) => {
    const authorized = new Request(input, init)
    authorized.headers.set('Authorization', `Bearer ${accessToken}`)
    return globalThis.fetch(authorized)
  }

/** Session から、画面に渡してよい値だけを取り出す。 */
export const viewerOf = ({
  staffId,
  staffName,
  facilityId,
  canManageStaff,
  canCheckReceipt,
  schedulePolicies,
}: Session): Viewer => ({
  staffId,
  staffName,
  facilityId,
  canManageStaff,
  canCheckReceipt,
  schedulePolicies,
})

/**
 * リクエストの cookie のセッションの職員を返す。ログインしていなければ null を返す。
 *
 * 権限は、ログインのときにセッションへ写した値ではなく、その度に GET /v1/me で読み直す。
 * ログインの後に職員の管理の画面で権限を変えても、ログインし直さずに画面の出し分けへ写すためである。
 * GET /v1/me が失敗したとき、届かないときは、セッションの値を返す。拒むのは各 API である。
 */
export const readViewer = async (request: Request, deps: AuthDeps): Promise<Viewer | null> => {
  const session = await readSession(request, deps)
  if (session === undefined) return null
  const me = await deps.fetchMe(session.accessToken).catch(() => undefined)
  return me?.ok === true ? me.viewer : viewerOf(session)
}
