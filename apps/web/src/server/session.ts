import type { Viewer } from '#/api/types'

import { SessionUnavailableError } from '#/api/sessionUnavailable'

import {
  GrantRejectedError,
  OIDC_TIMEOUT_SECONDS,
  refreshFailureOf,
  type OidcClient,
  type Tokens,
} from './oidc'
import type { SessionStore } from './sessionStore'
import { verifySignedValue } from './signedValue'

/** Valkey に置くセッション。トークンはブラウザに渡さない。 */
export type Session = Viewer & {
  accessToken: string
  refreshToken?: string
  /** access token の期限の UNIX 時刻（ミリ秒）。分からなければ undefined。 */
  expiresAt?: number
  /** ログアウトで Hydra に添える ID token。この項目を足す前に作ったセッションには無い。 */
  idToken?: string
}

/** セッションの読み取りと更新が使う依存。 */
export type SessionDeps = {
  store: SessionStore
  oidc: OidcClient
  secret: string
  now?: () => number
  /** ほかのリクエストが更新するのを待つときに使う。テストで替える。 */
  wait?: (ms: number) => Promise<void>
}

export const SESSION_COOKIE = 'buddy_session'
export const SESSION_TTL_SECONDS = 12 * 60 * 60
/** 期限まで、この長さを切った access token は、使う前に更新する。 */
const REFRESH_MARGIN_MS = 60 * 1000
/** 更新の鍵を持つ長さ。Hydra のレスポンスを待つ上限の 2 倍にする。 */
const REFRESH_LOCK_MS = OIDC_TIMEOUT_SECONDS * 2 * 1000
/** ほかのリクエストの更新を待つ間隔。待つのは、鍵が放されるか期限が切れるまでである。 */
const REFRESH_POLL_MS = 200

/** セッションの ID から、Valkey のキーを作る。 */
export const sessionKey = (id: string) => `session:${id}`
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

/** リクエストの cookie から、署名を確認したセッションの ID を返す。無いか署名が合わなければ undefined を返す。 */
export const sessionIdOf = (request: Request, secret: string) =>
  verifySignedValue(readCookie(request.headers.get('Cookie'), SESSION_COOKIE), secret)

/** トークンの期限を、受け取った時刻 now からの UNIX 時刻（ミリ秒）にする。期限が無ければ undefined を返す。 */
export const expiresAtOf = (tokens: Tokens, now: number) =>
  tokens.expiresIn === undefined ? undefined : now + tokens.expiresIn * 1000

/**
 * リクエストの cookie のセッションを返す。access token の期限が近ければ refresh token で更新して置き直す。
 *
 * セッションが無いとき、期限が切れて更新できないときは undefined を返す。Hydra が refresh token を拒んだときだけ、
 * セッションを消す。そのほかの失敗では消さず、access token がまだ使えればそれを返し、使えなければ SessionUnavailableError を投げる。
 * 更新は 1 回の呼び出しで 1 度だけ試し、失敗しても試し直さない（ADR-0044）。
 */
export const readSession = async (
  request: Request,
  deps: SessionDeps,
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

/** 同じプロセスの中で、同じセッションの更新を 1 本にまとめる。 */
const inFlight = new Map<string, Promise<Session | undefined>>()

const refreshOnce = (id: string, session: Session, now: number, deps: SessionDeps) => {
  const running = inFlight.get(id)
  if (running !== undefined) return running
  const refreshing = refresh(id, session, now, deps).finally(() => inFlight.delete(id))
  inFlight.set(id, refreshing)
  return refreshing
}

/**
 * Valkey の鍵で、ほかのプロセスとも更新を 1 本にする。refresh token をローテーションする Hydra は、使い回しを拒むためである。
 * 鍵を取れなかったリクエストは、更新した値が置かれるか鍵が放されるまで待つ。
 */
const refresh = async (
  id: string,
  session: Session,
  now: number,
  deps: SessionDeps,
): Promise<Session | undefined> => {
  const stillValid = (s: Session) => s.expiresAt !== undefined && s.expiresAt > now
  const lockKey = refreshLockKey(id)
  const token = await deps.store.lock(lockKey, REFRESH_LOCK_MS)
  if (token === undefined) {
    for (let waited = 0; waited < REFRESH_LOCK_MS; waited += REFRESH_POLL_MS) {
      await (deps.wait ?? sleep)(REFRESH_POLL_MS)
      const latest = await deps.store.get<Session>(sessionKey(id))
      if (latest === undefined) return undefined
      if (latest.accessToken !== session.accessToken) return latest
      if (!(await deps.store.exists(lockKey))) break
    }
    // 鍵を持つリクエストが更新できなかったか、待ちの上限を過ぎた。鍵を持つ側と同じく、セッションを残して一時的な失敗にする
    if (stillValid(session)) return session
    throw new SessionUnavailableError()
  }
  try {
    // 鍵を取る前に、ほかのリクエストが更新し終えていることがある。古い refresh token を送らないよう読み直す
    const latest = await deps.store.get<Session>(sessionKey(id))
    if (latest === undefined) return undefined
    if (latest.accessToken !== session.accessToken || latest.refreshToken === undefined)
      return latest
    try {
      const tokens = await deps.oidc.refresh(latest.refreshToken)
      // refresh の失敗の率の分母にする（context/operations.md の監視の項目とアラートの条件）
      console.info(JSON.stringify({ msg: 'session refreshed' }))
      const refreshed: Session = {
        ...latest,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? latest.refreshToken,
        expiresAt: expiresAtOf(tokens, now),
        idToken: tokens.idToken ?? latest.idToken,
      }
      return (await deps.store.replace(sessionKey(id), refreshed)) ? refreshed : undefined
    } catch (error) {
      // トークンとセッションの ID は書かない
      console.warn(JSON.stringify({ msg: 'session refresh failed', ...refreshFailureOf(error) }))
      if (error instanceof GrantRejectedError) {
        await deps.store.delete(sessionKey(id))
        return undefined
      }
      if (stillValid(latest)) return latest
      throw new SessionUnavailableError()
    }
  } finally {
    await deps.store.unlock(lockKey, token)
  }
}
