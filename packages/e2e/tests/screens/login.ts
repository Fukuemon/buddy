import type { Page } from '@playwright/test'

import { BASE_URL } from '../fixtures/env'
import { brokerLogin, idpLogin } from '../selectors/idp'

/** ブローカーのログインの画面で email を入れて次へ進む。 */
export const enterEmailAtBroker = async (page: Page, email: string) => {
  const broker = brokerLogin(page)
  await broker.email.fill(email)
  await broker.next.click()
}

/**
 * 上流の IdP のフェイクのログインの画面で、email を確認済みのクレームにして入る。sub は email の @ の前の部分にする。
 * 入った後の画面への移動は待たない。
 */
export const signInAtUpstreamIdp = async (page: Page, email: string) => {
  const idp = idpLogin(page)
  await idp.username.fill(email.split('@')[0])
  await idp.claims.fill(JSON.stringify({ email, email_verified: true }))
  await idp.signIn.click()
}

/**
 * ブローカーのログインの画面で email を入れ、事業所の上流の IdP のフェイクで入り、buddy の画面に戻るまで待つ。
 * ログインに失敗した案内の画面でも戻る。
 *
 * 上流の IdP の sub は、upstreamEmail の @ の前の部分にする。ブローカーは初回のログインでこの sub を職員に結び付けるので、
 * 同じ職員には毎回同じ sub で入る。
 *
 * @param o.upstreamEmail 上流の IdP の ID token のメール。デフォルトは email
 */
export const signInAtBroker = async (
  page: Page,
  email: string,
  o: { upstreamEmail?: string } = {},
) => {
  await enterEmailAtBroker(page, email)
  await signInAtUpstreamIdp(page, o.upstreamEmail ?? email)
  await page.waitForURL(
    (url) =>
      url.href.startsWith(BASE_URL) &&
      (!url.pathname.startsWith('/auth/') || url.pathname === '/auth/error'),
  )
}
