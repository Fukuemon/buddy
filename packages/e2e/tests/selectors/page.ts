import type { Page } from '@playwright/test'

/** 画面の地（`body`）。地の色を確かめるために使う。要素ではないので testid が無い。 */
export const pageBody = (page: Page) => page.locator('body')
