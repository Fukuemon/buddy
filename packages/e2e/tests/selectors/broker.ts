import type { Page } from '@playwright/test'

/**
 * ブローカーの画面（services/broker）のうち、メールの入力と送信のほかの要素。web の画面ではないので testid が無い。
 * メールの入力と送信は selectors/idp.ts の brokerLogin にある。
 */
export const brokerPage = (page: Page) => ({
  heading: page.locator('h1'),
  emailLabel: page.locator('label[for="email"]'),
  emailHint: page.locator('#email-hint'),
})
