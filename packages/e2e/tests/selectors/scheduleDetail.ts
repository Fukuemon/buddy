import type { Page } from '@playwright/test'

/** 予定の詳細のダイアログの、項目の値（dd）。行ごとの testid が無い。 */
export const scheduleDetailValues = (page: Page) =>
  page.getByTestId('schedule-detail-modal').getByRole('definition')
