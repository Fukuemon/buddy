import type { Page } from '@playwright/test'

/** 日の表示の予定。題名に時刻と利用者の名前が付くので、題名の文字で指す。 */
export const dayGridEvent = (page: Page, title: string) =>
  page.getByTestId('staff-schedule-day-grid').getByText(title)
