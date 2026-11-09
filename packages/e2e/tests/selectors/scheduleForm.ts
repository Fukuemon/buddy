import type { Page } from '@playwright/test'

/** 予定の作成と編集のダイアログの、保存の失敗の文。文に testid が無い。 */
export const scheduleFormSubmitError = (page: Page) =>
  page.getByTestId('schedule-form-modal').getByRole('alert')
