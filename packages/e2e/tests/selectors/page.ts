import type { Page } from '@playwright/test'

/** 画面の背景（`body`）。背景の色と、testid の無い見出しの文を確認するために使う。要素ではないので testid が無い。 */
export const pageBody = (page: Page) => page.locator('body')
