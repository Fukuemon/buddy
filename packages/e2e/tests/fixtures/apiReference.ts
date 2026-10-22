import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { APIRequestContext, Page } from '@playwright/test'

import { BASE_URL, IDP_URL, RECEIPT_API_URL, SCHEDULE_API_URL } from './env'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

/**
 * API の参照のページを開く origin。ローカル環境の文書のサイト（zensical serve）と同じにする。
 * compose の 2 つの API は、この origin だけに CORS を許す。
 */
export const API_REFERENCE_ORIGIN = 'http://localhost:8000'

/** openapi.yaml の servers が指す、compose のデフォルトのポートの API と、送り直す先。 */
const API_FORWARDS = [
  { from: 'http://localhost:8080', to: SCHEDULE_API_URL },
  { from: 'http://localhost:8090', to: RECEIPT_API_URL },
]

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.yaml': 'application/yaml',
}

/**
 * API の参照のページ（docs/api/）を、文書のサイトを起動せずに、リポジトリのファイルから開けるようにする。
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
 * compose の IdP で、name でログインした職員の access token を取る。API の参照のページの認証の欄に入れる。
 * API はトークンの iss を http://idp:9000/buddy と確かめ、IdP は iss をリクエストの Host から決めるので、Host を書き換えて取る。
 */
export const issueAccessToken = async (request: APIRequestContext, name: string) => {
  const redirectUri = `${BASE_URL}/cb`
  const authorized = await request.post(`${IDP_URL}/buddy/authorize`, {
    params: {
      client_id: 'web',
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'openid',
      state: 'evidence',
    },
    form: { username: name },
    maxRedirects: 0,
  })
  const code = new URL(authorized.headers().location ?? '', BASE_URL).searchParams.get('code')
  if (!code) throw new Error(`IdP から認可コードを取れない: ${authorized.status()}`)
  const token = await request.post(`${IDP_URL}/buddy/token`, {
    headers: { Host: 'idp:9000' },
    form: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: 'web',
      client_secret: 'web-dev',
    },
  })
  if (!token.ok()) throw new Error(`IdP からトークンを取れない: ${token.status()}`)
  return ((await token.json()) as { access_token: string }).access_token
}

/**
 * recordPrEvidence の prepare に渡す。API の参照のページを開いてから、name で入った職員のトークンを取って返す。
 * 録画は、このページの origin の sessionStorage を持ち越して始まる。
 *
 * @param api docs/api/ のページの名前
 * @param name compose の IdP にログインする名前。トークンを使わない spec は null にする
 */
export const prepareApiReference =
  (api: 'schedule-api' | 'receipt-api', name: string | null) => async (page: Page) => {
    await routeApiReference(page)
    await page.goto(`${API_REFERENCE_ORIGIN}/api/${api}.html`)
    return name === null ? '' : issueAccessToken(page.request, name)
  }
