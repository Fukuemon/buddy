import type { Page } from '@playwright/test'

/** 予定の詳細のダイアログの、項目の値（dd）。行ごとの testid が無い。 */
export const scheduleDetailValues = (page: Page) =>
  page.getByTestId('schedule-detail-modal').getByRole('definition')

/** 予定の詳細を読めなかったときの文。読み込みの失敗のモーダルは、文に testid が無い。 */
export const scheduleDetailError = (page: Page) => page.getByRole('dialog').getByRole('alert')
