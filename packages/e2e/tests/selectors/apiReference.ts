import type { Page } from '@playwright/test'

/** API の参照のページ（Scalar）で、操作のリクエストを送るクライアントを開くボタン。 */
export const testRequestButton = (page: Page, method: string, path: string) =>
  page.getByRole('button', { name: `Test Request (${method} ${path})` })

/** API の参照のページ（Scalar）のリクエストを送るクライアント。buddy の画面ではないので testid が無い。 */
export const apiClient = (page: Page) => {
  const dialog = page.getByRole('dialog')
  return {
    dialog,
    /** 認証の欄。値は伏せ字で出る */
    token: dialog.getByPlaceholder('Token'),
    /** パスの引数の行。値は、例の値を選ぶか「Add value」で足すドロップダウンである */
    variableValue: (name: string) => dialog.locator(`tr[id="${name}"]`).getByRole('button').first(),
    /** クエリの引数の行の値の欄。打つと、その引数をリクエストに含める */
    queryValue: (name: string) =>
      dialog.locator(`tr[id="${name}"]`).getByRole('combobox', { name: 'Value' }),
    addValue: page.getByText('Add value', { exact: true }),
    body: dialog.locator('.cm-content'),
    send: dialog.getByRole('button', { name: /^Send/ }).first(),
  }
}
