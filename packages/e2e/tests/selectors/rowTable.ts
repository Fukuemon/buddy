import type { Locator } from '@playwright/test'

/**
 * `@buddy/ui` の行の表のうち、testid を持たない部分。
 * 行の右端の「›」をエビデンスで確認するために使う。
 */
export const rowTableParts = (table: Locator) => {
  const firstRow = table.locator('tbody tr').first()
  return {
    firstRow,
    /** 1 行目の右端の「›」 */
    firstRowGo: firstRow.getByText('›', { exact: true }),
  }
}
