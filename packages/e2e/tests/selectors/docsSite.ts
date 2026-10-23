import type { Page } from '@playwright/test'

/** ドキュメントサイト（Zensical）のページ。buddy の画面ではないので testid が無い。 */
export const docsPage = (page: Page) => ({
  /** 本文 */
  content: page.locator('article.md-typeset'),
  /** 本文の中のコードスパン */
  code: page.locator('article.md-typeset p code').first(),
  /** 画面仕様書に埋め込んだモック */
  mock: page.locator('iframe.mock').first(),
  /** 本文の表 */
  table: page.locator('article.md-typeset table').first(),
})
