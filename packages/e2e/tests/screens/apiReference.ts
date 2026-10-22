import type { Page } from '@playwright/test'

import { API_REFERENCE_ORIGIN } from '../fixtures/apiReference'
import { apiClient, testRequestButton } from '../selectors/apiReference'

/**
 * API の参照のページで操作を開き、「Test Request」からリクエストを送るクライアントを開く。
 * ページは fixtures の routeApiReference を張ってから開く。
 *
 * @param api docs/api/ のページの名前
 * @param o.tag openapi.yaml の操作の tags
 * @param o.method 小文字の HTTP のメソッド
 * @param o.path openapi.yaml のパス。引数は {user_id} の形のまま渡す
 */
export const openApiClient = async (
  page: Page,
  api: 'schedule-api' | 'receipt-api',
  o: { tag: string; method: string; path: string },
) => {
  await page.goto(
    `${API_REFERENCE_ORIGIN}/api/${api}.html#tag/${o.tag}/${o.method.toUpperCase()}${o.path}`,
  )
  await testRequestButton(page, o.method, o.path).click()
  await apiClient(page).dialog.waitFor()
}

/** クライアントの認証の欄に、トークンを伏せ字のまま入れる。 */
export const fillApiToken = async (page: Page, token: string) => {
  await apiClient(page).token.fill(token)
}

/** パスの引数に、例に無い値を「Add value」で足して選ぶ。 */
export const fillApiVariable = async (page: Page, name: string, value: string) => {
  const client = apiClient(page)
  await client.variableValue(name).click()
  await client.addValue.click()
  // 「Add value」の欄は、前に選んだ値を持って開くことがあるので、消してから打つ
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(value)
  await page.keyboard.press('Enter')
  await client.variableValue(name).filter({ hasText: value }).waitFor()
}

/** 本文の JSON を、例から body に入れ替える。 */
export const fillApiBody = async (page: Page, body: unknown) => {
  const client = apiClient(page)
  await client.body.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(JSON.stringify(body, null, 2))
}
