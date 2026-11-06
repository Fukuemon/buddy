import type { Locator } from '@playwright/test'

/**
 * scope の中の、文が text の入力の欄の見出し（label の要素）。
 * 見出しには testid を付けていないので、見出しを押して欄にフォーカスが移ることを確認するときに使う。
 */
export const fieldLabel = (scope: Locator, text: string) =>
  scope.locator('label').getByText(text, { exact: true })

/** scope の中の、見出しの文が label の入力の欄。testid を付けない story の欄を指すときに使う。 */
export const fieldByLabel = (scope: Locator, label: string) =>
  scope.getByLabel(label, { exact: true })

/**
 * scope の中の、割り込みで読み上げる要素（role="alert"）。
 * 欄の誤りの文は割り込みで読み上げないので、送った後に 0 個であることを確認するときに使う。
 */
export const alertMessages = (scope: Locator) => scope.getByRole('alert')

/** scope の中の、誤りを出した予定のフォームの項目のボタン。並びの順は画面の上からの順である。 */
export const invalidSummaryItems = (scope: Locator) => scope.locator('[data-invalid]')

/** scope の中の、欄の下の補足の文か誤りの文（span の要素）。補足と誤りの文には testid を付けていない。 */
export const fieldNote = (scope: Locator, text: string) =>
  scope.locator('span').getByText(text, { exact: true })
