import type { Page } from '@playwright/test'

import { API_REFERENCE_ORIGIN } from '../fixtures/apiReference'
import { apiClient, testRequestButton } from '../selectors/apiReference'

/**
 * API の参照のページを開く。ページは fixtures の routeApiReference を張ってから開く。
 * recordPrEvidence の prepare で開くと、録画は、このページの origin の sessionStorage を持ち越して始まる。
 *
 * @param api docs/api/ のページの名前
 */
export const openApiReference = async (page: Page, api: 'schedule' | 'receipt') => {
  await page.goto(`${API_REFERENCE_ORIGIN}/api/${api}.html`)
}

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
  api: 'schedule' | 'receipt',
  o: { tag: string; method: string; path: string },
) => {
  await page.goto(
    `${API_REFERENCE_ORIGIN}/api/${api}.html#tag/${o.tag}/${o.method.toUpperCase()}${o.path}`,
  )
  await testRequestButton(page, o.method, o.path).click()
  await apiClient(page).dialog.waitFor()
}
