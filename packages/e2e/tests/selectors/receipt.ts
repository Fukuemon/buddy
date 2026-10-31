import type { Page } from '@playwright/test'

/** 照合の結果の表で、利用者名を含む行。行には testid が無い。 */
export const receiptResultRow = (page: Page, patient: string) =>
  page.getByTestId('receipt-result-table').getByRole('row').filter({ hasText: patient })

/** 照合の結果の表の、列の見出しのセル。列の順に並ぶ。 */
export const receiptResultHeaderCells = (page: Page) =>
  page.getByTestId('receipt-result-table').getByRole('columnheader')

/**
 * 照合の結果の表で、区分の中の、訪問日と利用者名を含む行のセル。区分ごとに tbody が分かれ、先頭に区分の見出しの行がある。
 * セルは結果の表の列の順に並ぶ。
 */
export const receiptCategoryRowCells = (
  page: Page,
  category: 'mismatch' | 'schedule_only' | 'visit_only' | 'match',
  date: string,
  patient: string,
) =>
  page
    .getByTestId('receipt-result-table')
    .getByRole('rowgroup')
    .filter({ has: page.getByTestId(`receipt-category-${category}`) })
    .getByRole('row')
    .filter({ hasText: date })
    .filter({ hasText: patient })
    .getByRole('cell')
