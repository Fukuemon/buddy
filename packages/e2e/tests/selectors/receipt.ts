import type { Page } from '@playwright/test'

/** 照合の結果の表で、利用者名を含む行。行には testid が無い。 */
export const receiptResultRow = (page: Page, patient: string) =>
  page.getByTestId('receipt-result-table').getByRole('row').filter({ hasText: patient })
