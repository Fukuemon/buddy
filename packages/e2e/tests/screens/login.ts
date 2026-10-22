import type { Page } from '@playwright/test'

import { BASE_URL } from '../fixtures/env'
import { idpLogin } from '../selectors/idp'

/**
 * IdP のログインの画面で name を入れて入り、buddy の画面に戻るまで待つ。ログインに失敗した案内の画面でも戻る。
 * IdP のデフォルトのクレームは、compose/idp.json の職員を指す。
 */
export const signInAtIdp = async (page: Page, name: string) => {
  const form = idpLogin(page)
  await form.username.fill(name)
  await form.signIn.click()
  await page.waitForURL(
    (url) =>
      url.href.startsWith(BASE_URL) &&
      (!url.pathname.startsWith('/auth/') || url.pathname === '/auth/error'),
  )
}
