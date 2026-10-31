import type { Locator, Page } from '@playwright/test'

/**
 * 確認が必要な予定の一覧のモックの行の中で、testid を持たない部分。
 * 行の見た目（行ごとのボタンが無いこと、「›」、職員を折り返さないこと）をエビデンスで確認するために使う。
 */
export const reviewMockRowParts = (row: Locator) => ({
  /** 行の中のボタン。共通の形では 0 個にする */
  buttons: row.getByRole('button'),
  /** 行の右端の「›」 */
  go: row.locator('.wf-cell-go'),
  /** 職員の列。折り返さない */
  staff: row.locator('.sr-cell-nowrap').first(),
})

/** モックの文書の全体。横にスクロールしないことを、幅で確認するために使う */
export const mockRoot = (page: Page) => page.locator('html')

/** モックの画面の本文。画面に出す語を確認するために使う */
export const mockMain = (page: Page) => page.locator('main')

/** 予定のモーダルのタイトル。testid を持たないので、見出しの名前で指す */
export const scheduleModalTitle = (modal: Locator, name: string) =>
  modal.getByRole('heading', { name })
