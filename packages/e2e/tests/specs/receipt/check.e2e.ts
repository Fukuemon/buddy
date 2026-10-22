import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { LEADER, RECEIPT_TESTDATA } from '../../fixtures/env'
import { receiptResultRow } from '../../selectors/receipt'

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む。
// calendarpit の森のカレンダー（compose/calendarpit/fixture.json）は 2026 年 11 月の予定を持ち、実績の CSV は 2024 年 4 月なので、予定は全て予定のみの行になる。
const CALENDAR_MONTH = '2026-11'

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

    test('狭い幅で結果の表を右端まで送った場合、区分の見出しの文字が表の左端に残ること', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      const table = page.getByTestId('receipt-result-table')
      const scrolled = await table.evaluate((element) => {
        element.scrollLeft = element.scrollWidth
        return element.scrollLeft
      })
      expect(scrolled).toBeGreaterThan(0)

      const tableBox = await table.boundingBox()
      const labelBox = await page.getByTestId('receipt-category-label-mismatch').boundingBox()
      // 文字は、表の箱の左端から、見出しのセルの余白（20px）の位置に残る
      expect((labelBox?.x ?? 0) - (tableBox?.x ?? 0)).toBeGreaterThanOrEqual(0)
      expect((labelBox?.x ?? 0) - (tableBox?.x ?? 0)).toBeLessThan(40)
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

  test.describe('Google カレンダーの予定での照合', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/receipt')
      await page.getByTestId('receipt-source-calendar').check()
      await expect(page.getByTestId('receipt-source-csv')).not.toBeChecked()
      await page.getByTestId('receipt-month').fill(CALENDAR_MONTH)
      await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
      await page.getByTestId('receipt-check-submit').click()
      await expect(page).toHaveURL(/\/receipt\/result$/)
    })

    test('対象の月を選んで照合した場合、その月の Google カレンダーの予定が予定のみの行に出ること', async ({
      page,
    }) => {
      await expect(page.getByTestId('receipt-result')).toContainText(
        '2026 年 11 月の Google カレンダー',
      )
      await expect(page.getByTestId('receipt-summary-visit_only')).toHaveText('7 件')
      await expect(page.getByTestId('receipt-category-schedule_only')).toBeVisible()

      // 毎週の予定は、取り消した 11 日の回を除き、18 日は置き換えた回の時刻で出る
      const futaba = receiptResultRow(page, '見本二葉')
      await expect(futaba).toHaveCount(3)
      await expect(futaba).toContainText(['2026-11-04', '2026-11-18', '2026-11-25'])
      await expect(futaba).toContainText(['09:00', '14:00', '09:00'])
      await expect(futaba.first()).toContainText(LEADER.staff.name)
      await expect(receiptResultRow(page, '見本一郎')).toContainText(['2026-11-02', '2026-11-16'])
    })
  })
})
