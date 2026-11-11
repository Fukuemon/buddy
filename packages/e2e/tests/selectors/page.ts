import type { Page } from '@playwright/test'

/** 画面の背景（`body`）。背景の色と、testid の無い見出しの文を確認するために使う。要素ではないので testid が無い。 */
export const pageBody = (page: Page) => page.locator('body')

/** 文書の全体（`html`）。横にスクロールしないことを、幅で確認するために使う。要素ではないので testid が無い。 */
export const pageRoot = (page: Page) => page.locator('html')

/** 画面の本文の見出し（`h1`）。一覧の画面の見出しは testid を持たないので、サーバーで描画した HTML に入ったかを名前で確認するために使う。 */
export const pageHeading = (page: Page, name: string) =>
  page.getByRole('heading', { name, level: 1 })

/**
 * 画面を表示できない表示と一時的に使えない表示の見出しと、読み直すのリンク。改修前と改修後で testid が違う表示を、同じ関数で確認するために使う。
 * どちらの表示も、testid は表示の全体（page-error、page-unavailable）にだけ付く。
 */
export const pageFailure = (page: Page) => {
  const root = page.locator('[data-testid="page-error"], [data-testid="page-unavailable"]')
  return { heading: root.locator('h1'), reload: root.locator('a', { hasText: '読み直す' }) }
}
