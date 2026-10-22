import type { Page } from '@playwright/test'

/** calendarpit の管理の画面の、タイトルが summary の予定。buddy の画面ではないので testid が無い。 */
export const calendarpitEvent = (page: Page, summary: string) =>
  page.getByText(summary, { exact: true })
