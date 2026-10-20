import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { RECEIPT_TESTDATA } from '../../fixtures/env'

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

    test('予定と実績の CSV を上げた場合、4 つの区分の件数が結果の画面に出ること', async ({
      page,
    }) => {
      await expect(page.getByTestId('receipt-summary-mismatch')).toHaveText('3 件')
      await expect(page.getByTestId('receipt-summary-schedule_only')).toHaveText('1 件')
      await expect(page.getByTestId('receipt-summary-visit_only')).toHaveText('1 件')
      await expect(page.getByTestId('receipt-summary-match')).toHaveText('3 件')
      await expect(page.getByTestId('receipt-category-mismatch')).toHaveText('不整合データ（3 件）')
    })

    test('結果の CSV をダウンロードした場合、BOM 付きの UTF-8 で区分の区切りの行を持つこと', async ({
      page,
    }) => {
      const download = page.waitForEvent('download')
      await page.getByTestId('receipt-download').click()
      const file = await (await download).path()

      const bytes = await readFile(file)
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const csv = bytes.subarray(3).toString('utf8')
      expect(csv).toMatch(/^訪問日,利用者名,主訪問者,/)
      expect(csv).toContain('\r\n不整合データ,---,')
      expect(csv).toContain('\r\n整合データ,---,')
    })
  })
})
