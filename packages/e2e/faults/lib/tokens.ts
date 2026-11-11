// Hydra のトークンのエンドポイントと、予定の API を、ブラウザを通さずに直に呼ぶ。#877 の測定で curl で呼んだのと同じ道である。
import { request as apiRequest, type APIRequestContext } from '@playwright/test'

import { BASE_URL, HYDRA_URL, SCHEDULE_URL } from '../../tests/fixtures/env'

/** web のクライアントの認証のヘッダー。compose/hydra/clients.sh の web と同じ値である。 */
const WEB_CLIENT_AUTH = `Basic ${Buffer.from('web:web-dev').toString('base64')}`

/** 予定の API のクライアントの認証のヘッダー。client credentials で、ブローカーの内部の API を呼ぶのに使う。 */
const SCHEDULE_CLIENT_AUTH = `Basic ${Buffer.from('schedule:schedule-dev').toString('base64')}`

const REDIRECT_URI = `${BASE_URL}/auth/callback`

/**
 * 1 回の呼び出しを待つ上限。Hydra が答えない hook を待つ約 93 秒より長くし、答えない故障でも結果を記録できるようにする。
 */
const CALL_TIMEOUT_MS = 120_000

/** ログインの状態を持たない、新しい request の context を作る。証明書のエラーの扱いは playwright.config.ts と同じにする。 */
export const createApiContext = () =>
  apiRequest.newContext({
    storageState: { cookies: [], origins: [] },
    ignoreHTTPSErrors: BASE_URL.startsWith('https://'),
    timeout: CALL_TIMEOUT_MS,
  })

/** 1 回の呼び出しの結果。答えが無いまま切れたときは status が null で、failure に例外の文を入れる。 */
export type CallResult = {
  status: number | null
  /** OAuth のエラーの値か、予定の API のエラーの code。 */
  error?: string
  seconds: number
  failure?: string
}

const elapsed = (start: number) => Math.round((Date.now() - start) / 100) / 10

/** fn を呼び、状態コードと、本文の error か code と、かかった秒を返す。例外は failure にして返す。 */
const measure = async (
  fn: () => ReturnType<APIRequestContext['post']>,
): Promise<CallResult & { body?: Record<string, unknown> }> => {
  const start = Date.now()
  try {
    const res = await fn()
    const body = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined
    const error = body?.error ?? body?.code
    return {
      status: res.status(),
      ...(typeof error === 'string' ? { error } : {}),
      seconds: elapsed(start),
      body,
    }
  } catch (e) {
    return { status: null, seconds: elapsed(start), failure: (e as Error).message.split('\n')[0] }
  }
}

/** web のクライアントで取ったトークン。 */
type Tokens = { accessToken: string; refreshToken: string }

/** ログインの手順のどこまで進んだか。認可コードの交換まで進めば exchange に結果が入る。 */
type LoginResult =
  | { ok: true; tokens: Tokens; code: string; exchange: CallResult }
  | { ok: false; step: string; code?: string; exchange?: CallResult; failure?: string }

/**
 * email の職員として、Hydra、ブローカー、上流の IdP のフェイクを順に通ってログインし、認可コードをトークンに換える。
 * 手順は compose/dev-token.sh と tests/fixtures/apiReference.ts の issueAccessToken と同じで、refresh token も返す。
 * 故障の中で流すので、失敗した手順の名前を返し、投げない。
 */
export const login = async (request: APIRequestContext, email: string): Promise<LoginResult> => {
  let step = 'authorize'
  try {
    const next = async (url: string, form?: Record<string, string>) => {
      const res = form
        ? await request.post(url, { form, maxRedirects: 0 })
        : await request.get(url, { maxRedirects: 0 })
      const location = res.headers().location
      if (!location) throw new Error(`リダイレクトされない: ${res.status()}`)
      return new URL(location, url)
    }
    const auth = new URL(`${HYDRA_URL}/oauth2/auth`)
    auth.search = new URLSearchParams({
      client_id: 'web',
      response_type: 'code',
      scope: 'openid email offline_access',
      state: 'faults-state',
      redirect_uri: REDIRECT_URI,
    }).toString()
    const loginPage = await next(auth.href)
    step = 'broker-login'
    const upstream = await next(new URL('/login', loginPage).href, {
      login_challenge: loginPage.searchParams.get('login_challenge') ?? '',
      email,
    })
    if (upstream.href.startsWith(HYDRA_URL) || upstream.href.startsWith(BASE_URL))
      return { ok: false, step, failure: `ブローカーがログインを拒んだ: ${upstream.pathname}` }
    step = 'upstream-idp'
    let to = await next(upstream.href, {
      username: email.split('@')[0],
      claims: JSON.stringify({ email, email_verified: true }),
    })
    step = 'consent'
    while (!to.href.startsWith(REDIRECT_URI)) to = await next(to.href)
    const code = to.searchParams.get('code')
    if (!code) return { ok: false, step, failure: `認可コードが無い: ${to.search}` }
    step = 'exchange'
    const exchange = await exchangeCode(request, code)
    if (exchange.status !== 200) return { ok: false, step, code, exchange: strip(exchange) }
    const body = exchange.body as { access_token: string; refresh_token: string }
    return {
      ok: true,
      code,
      tokens: { accessToken: body.access_token, refreshToken: body.refresh_token },
      exchange: strip(exchange),
    }
  } catch (e) {
    return { ok: false, step, failure: (e as Error).message.split('\n')[0] }
  }
}

/** 本文を落とし、トークンを結果に残さない。 */
const strip = ({ body: _body, ...rest }: CallResult & { body?: unknown }): CallResult => rest

/** 認可コードをトークンに換える。 */
export const exchangeCode = (request: APIRequestContext, code: string) =>
  measure(() =>
    request.post(`${HYDRA_URL}/oauth2/token`, {
      headers: { Authorization: WEB_CLIENT_AUTH },
      form: { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI },
    }),
  )

/** refresh token で、トークンを取り直す。通ったら新しいトークンも返す。 */
export const refresh = async (
  request: APIRequestContext,
  refreshToken: string,
): Promise<CallResult & { tokens?: Tokens }> => {
  const result = await measure(() =>
    request.post(`${HYDRA_URL}/oauth2/token`, {
      headers: { Authorization: WEB_CLIENT_AUTH },
      form: { grant_type: 'refresh_token', refresh_token: refreshToken },
    }),
  )
  if (result.status !== 200) return strip(result)
  const body = result.body as { access_token: string; refresh_token: string }
  return {
    ...strip(result),
    tokens: { accessToken: body.access_token, refreshToken: body.refresh_token },
  }
}

/** 予定の API のクライアントで、client credentials のトークンを取る。ブローカーの内部の API を呼ぶトークンで、hook を通る。 */
export const clientCredentials = async (request: APIRequestContext) =>
  strip(
    await measure(() =>
      request.post(`${HYDRA_URL}/oauth2/token`, {
        headers: { Authorization: SCHEDULE_CLIENT_AUTH },
        form: { grant_type: 'client_credentials', audience: 'broker' },
      }),
    ),
  )

/** 予定の API の自分の職員（GET /v1/me）を、access token で呼ぶ。 */
export const getMe = async (request: APIRequestContext, accessToken: string) =>
  strip(
    await measure(() =>
      request.get(`${SCHEDULE_URL}/v1/me`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    ),
  )

/** 予定の API の GET /readyz を呼ぶ。 */
export const getReadyz = async (request: APIRequestContext) =>
  strip(await measure(() => request.get(`${SCHEDULE_URL}/readyz`)))
