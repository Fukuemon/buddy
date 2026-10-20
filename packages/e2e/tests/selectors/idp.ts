import type { Page } from '@playwright/test'

/** compose の開発用の IdP（mock-oauth2-server）のログインの画面。buddy の画面ではないので testid が無い。 */
export const idpLogin = (page: Page) => ({
  username: page.locator('input[name="username"]'),
  signIn: page.locator('input[type="submit"]'),
})
