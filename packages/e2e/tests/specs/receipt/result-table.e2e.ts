import { expect, test } from '@playwright/test'

import { RECEIPT_TESTDATA } from '../../fixtures/env'
import { scrollToRightEnd } from '../../widgets/scroll/actions/scroll'

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

    test('狭い幅で結果の表を右端まで送った場合、区分の見出しの文字が表の左端に残ること', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      const table = page.getByTestId('receipt-result-table')
      const scrolled = await scrollToRightEnd(table)
      expect(scrolled).toBeGreaterThan(0)

      const tableBox = await table.boundingBox()
      const labelBox = await page.getByTestId('receipt-category-label-mismatch').boundingBox()
      // 文字は、表の箱の左端から、見出しのセルの余白（20px）の位置に残る
      expect((labelBox?.x ?? 0) - (tableBox?.x ?? 0)).toBeGreaterThanOrEqual(0)
      expect((labelBox?.x ?? 0) - (tableBox?.x ?? 0)).toBeLessThan(40)
    })
  })
})
