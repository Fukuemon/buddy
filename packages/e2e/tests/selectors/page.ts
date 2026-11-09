import type { Page } from '@playwright/test'

/** 画面の背景（`body`）。背景の色と、testid の無い見出しの文を確認するために使う。要素ではないので testid が無い。 */
export const pageBody = (page: Page) => page.locator('body')

/** 文書の全体（`html`）。横にスクロールしないことを、幅で確認するために使う。要素ではないので testid が無い。 */
export const pageRoot = (page: Page) => page.locator('html')

/** 画面の本文の見出し（`h1`）。一覧の画面の見出しは testid を持たないので、サーバーで描画した HTML に入ったかを名前で確認するために使う。 */
export const pageHeading = (page: Page, name: string) =>
  page.getByRole('heading', { name, level: 1 })
