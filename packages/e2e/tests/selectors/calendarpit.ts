import type { Page } from '@playwright/test'

/** calendarpit の管理の画面の、タイトルが summary の予定。buddy の画面ではないので testid が無い。 */
export const calendarpitEvent = (page: Page, summary: string) =>
  page.getByText(summary, { exact: true })

/** calendarpit の管理の API の応答を開いたページの、text を含む行。JSON の応答には testid が無い。 */
export const calendarpitText = (page: Page, text: string) => page.getByText(text).first()
