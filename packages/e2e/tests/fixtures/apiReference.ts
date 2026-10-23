import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { APIRequestContext, Page } from '@playwright/test'

import { BASE_URL, HYDRA_URL, RECEIPT_URL, SCHEDULE_URL } from './env'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

/**
 * API の参照のページを開く origin。ローカル環境のドキュメントサイト（zensical serve）と同じにする。
 * compose の 2 つの API は、この origin だけに CORS を許す。
 */
export const API_REFERENCE_ORIGIN = 'http://localhost:8000'

/** openapi.yaml の servers が指す、compose のデフォルトのポートの API と、送り直す先。 */
const API_FORWARDS = [
  { from: 'http://localhost:8080', to: SCHEDULE_URL },
  { from: 'http://localhost:8090', to: RECEIPT_URL },
]

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.yaml': 'application/yaml',
}

/**
 * API の参照のページ（docs/api/）を、ドキュメントサイトを起動せずに、リポジトリのファイルから開けるようにする。
 * ページが openapi.yaml の servers（compose のデフォルトのポート）へ送ったリクエストは、撮る compose の API へ送り直す。
 * 撮る compose のポートをずらしても、ページの Server の欄は openapi.yaml のままになる。
 */
export const routeApiReference = async (page: Page) => {
  await page.route(`${API_REFERENCE_ORIGIN}/**`, async (route) => {
    const file = new URL(route.request().url()).pathname
    await route.fulfill({
      body: await readFile(path.join(root, 'docs', file)),
      contentType: CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    })
  })
  for (const { from, to } of API_FORWARDS) {
    await page.route(`${from}/**`, async (route) => {
      const response = await route.fetch({ url: route.request().url().replace(from, to) })
      await route.fulfill({ response })
    })
  }
}

/**
 * compose のブローカーで、email の職員としてログインした access token を取る。API の参照のページの認証の欄に入れる。
 * ブラウザの代わりに、Hydra、ブローカー、上流の IdP のフェイクの画面を順に通り、web のコールバックの手前で認可コードを受け取る。
 * 手順は compose/dev-token.sh と同じである。
 */
export const issueAccessToken = async (request: APIRequestContext, email: string) => {
  const redirectUri = `${BASE_URL}/auth/callback`
  const next = async (url: string, form?: Record<string, string>) => {
    const res = form
      ? await request.post(url, { form, maxRedirects: 0 })
      : await request.get(url, { maxRedirects: 0 })
    const location = res.headers().location
    if (!location) throw new Error(`リダイレクトされない: ${res.status()} ${url}`)
    return new URL(location, url)
  }
  const auth = new URL(`${HYDRA_URL}/oauth2/auth`)
  auth.search = new URLSearchParams({
    client_id: 'web',
    response_type: 'code',
    scope: 'openid email offline_access',
    state: 'evidence-state',
    redirect_uri: redirectUri,
  }).toString()
  const login = await next(auth.href)
  const upstream = await next(new URL('/login', login).href, {
    login_challenge: login.searchParams.get('login_challenge') ?? '',
    email,
  })
  let to = await next(upstream.href, {
    username: email.split('@')[0],
    claims: JSON.stringify({ email, email_verified: true }),
  })
  while (!to.href.startsWith(redirectUri)) to = await next(to.href)
  const code = to.searchParams.get('code')
  if (!code) throw new Error(`認可コードを受け取れない: ${to.href}`)
  const token = await request.post(`${HYDRA_URL}/oauth2/token`, {
    headers: { Authorization: `Basic ${Buffer.from('web:web-dev').toString('base64')}` },
    form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
  })
  if (!token.ok()) throw new Error(`Hydra からトークンを取れない: ${token.status()}`)
  return ((await token.json()) as { access_token: string }).access_token
}

/**
 * recordPrEvidence の prepare に渡す。API の参照のページを開いてから、email で入った職員のトークンを取って返す。
 * 録画は、このページの origin の sessionStorage を持ち越して始まる。
 *
 * @param api docs/api/ のページの名前
 * @param email compose のブローカーにログインするメール。トークンを使わない spec は null にする
 */
export const prepareApiReference =
  (api: 'schedule' | 'receipt', email: string | null) => async (page: Page) => {
    await routeApiReference(page)
    await page.goto(`${API_REFERENCE_ORIGIN}/api/${api}.html`)
    return email === null ? '' : issueAccessToken(page.request, email)
  }
