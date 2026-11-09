import { expect, test } from '@playwright/test'

import { RECEIPT_TESTDATA } from '../../fixtures/env'
import { showAllReceiptRows } from '../../screens/receipt'

test.describe('照合の結果', () => {
  test.describe('予定の CSV での照合', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/receipt')
      await page.getByTestId('receipt-source-csv').check()
      await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
      await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
      await page.getByTestId('receipt-check-submit').click()
      await expect(page).toHaveURL(/\/receipt\/result$/)
    })

    test('予定と実績の CSV を上げた場合、4 つの区分の件数が区分の見出しにだけ出ること', async ({
      page,
    }) => {
      await showAllReceiptRows(page)
      await expect(page.getByTestId('receipt-category-mismatch')).toHaveText('不整合データ（3 件）')
      await expect(page.getByTestId('receipt-category-schedule_only')).toHaveText(
        '予定のみ（1 件）',
      )
      await expect(page.getByTestId('receipt-category-visit_only')).toHaveText('実績のみ（1 件）')
      await expect(page.getByTestId('receipt-category-match')).toHaveText('整合データ（3 件）')
    })
  })
})
