import type { Page } from '@playwright/test'

/**
 * ブローカーの画面（apps/broker から生成し、services/broker が出す）のうち、メールの入力と送信のほかの要素。
 * web の画面ではないので testid が無い。メールの入力と送信は selectors/idp.ts の brokerLogin にある。
 * 欄の id は packages/ui の FormField が生成するので、id の値では指さない。
 */
export const brokerPage = (page: Page) => ({
  heading: page.locator('h1'),
  // 失敗の画面の本文。カードの上端のロゴの p は aria-hidden なので除く
  message: page.locator('section > p:not([aria-hidden])'),
  emailLabel: page.locator('label', { hasText: 'メールアドレス' }),
  // FormField は、補足の文の id を、欄の id の後ろに -hint を付けた値にする
  emailHint: page.locator('form [id$="-hint"]'),
})
