import { expect, test } from '@playwright/test'

import { RECEIPT_TESTDATA } from '../../fixtures/env'
import { downloadFile } from '../../widgets/download/actions/download'

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

    test('結果の CSV をダウンロードした場合、BOM 付きの UTF-8 で区分と確認することの列を持ち、区切りの行を持たないこと', async ({
      page,
    }) => {
      const bytes = await downloadFile(page.getByTestId('receipt-download'))
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const csv = bytes.subarray(3).toString('utf8')
      expect(csv).toMatch(/^区分,訪問日,利用者名,主訪問者,[^\r\n]*,加算,確認すること\r\n/)
      expect(csv).not.toContain(',---')
      expect(csv).toMatch(/\r\n不整合データ,[^\r\n]*,不一致: /)
      expect(csv).toMatch(/\r\n整合データ,/)
    })
  })
})
