import type { Locator } from '@playwright/test'

/**
 * scope の中の、文が text の入力の欄の見出し（label の要素）。
 * 見出しには testid を付けていないので、見出しを押して欄にフォーカスが移ることを確認するときに使う。
 */
export const fieldLabel = (scope: Locator, text: string) =>
  scope.locator('label').getByText(text, { exact: true })
