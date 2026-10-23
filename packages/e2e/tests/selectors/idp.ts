import type { Page } from '@playwright/test'

/**
 * ブローカーのログインの画面（services/broker）。web の画面ではないので、画面仕様書と testid が無い。
 */
export const brokerLogin = (page: Page) => ({
  email: page.locator('input[name="email"]'),
  next: page.locator('button[type="submit"]'),
})

/** compose の上流の IdP のフェイク（mock-oauth2-server）のログインの画面。buddy の画面ではないので testid が無い。 */
export const idpLogin = (page: Page) => ({
  username: page.locator('input[name="username"]'),
  claims: page.locator('textarea[name="claims"]'),
  signIn: page.locator('input[type="submit"]'),
})
