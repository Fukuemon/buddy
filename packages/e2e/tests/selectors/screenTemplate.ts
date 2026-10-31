import type { Page } from '@playwright/test'

/**
 * 画面仕様書のテンプレート（`docs/screens/_template/mocks/`）の要素。
 * テンプレートの testid は `<画面 ID>` の仮の値で、`pnpm check:screens` の testid の照合の外にあるので、testid の属性を CSS で指す。
 */
export const screenTemplate = (page: Page) => {
  const testid = (id: string) => page.locator(`[data-testid="<画面 ID>-${id}"]`)
  return {
    /** 一覧の表 */
    table: testid('table'),
    /** 一覧の 1 つ目の行 */
    firstRow: testid('row-{id}').first(),
    /** 一覧の 1 つ目の行の名前の列 */
    firstName: testid('row-{id}').first().locator('.wf-cell-primary'),
    /** 一覧の 1 つ目の行の「›」 */
    firstGo: testid('row-{id}').first().locator('.wf-cell-go'),
    /** 名前の検索 */
    search: testid('search'),
    /** 件数 */
    count: testid('count'),
    /** 登録のボタン */
    create: testid('new'),
    /** ? のヘルプの開くボタン */
    help: testid('help'),
    /** ? のヘルプの説明 */
    helpText: testid('help-text'),
    /** 「詳しく」のボタン */
    more: testid('more'),
    /** 「詳しく」で開く説明 */
    moreText: testid('more-text'),
    /** 入力のダイアログ */
    formDialog: testid('form-dialog'),
    /** 入力のダイアログの閉じるボタン（×） */
    formClose: testid('form-close'),
    /** 入力のダイアログのキャンセル */
    formCancel: testid('form-cancel'),
    /** 入力のダイアログの主ボタン */
    formSubmit: testid('form-submit'),
    /** 確認のダイアログ */
    confirmDialog: testid('confirm-dialog'),
    /** 確認のダイアログのキャンセル */
    confirmCancel: testid('confirm-cancel'),
    /** 確認のダイアログの確定のボタン */
    confirmSubmit: testid('confirm-submit'),
    /** 確認のダイアログの中の閉じるボタン（×）。確認のダイアログには置かない */
    confirmClose: testid('confirm-dialog').getByRole('button', { name: '閉じる' }),
    /** 文書の全体。横にスクロールしないことを、幅で確認するために使う */
    root: page.locator('html'),
  }
}
