import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { LEADER, RECEIPT_TESTDATA } from '../../fixtures/env'
import { showAllReceiptRows } from '../../screens/receipt'
import { receiptCategoryRowCells, receiptResultRow } from '../../selectors/receipt'

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む。
// calendarpit の森のカレンダー（compose/calendarpit/fixture.json）は 2026 年 11 月の予定を持つ。
// 森のカレンダーには、先に流れる取り込みの spec が予定を書き出すことがあるので、件数を数えず、特定の行で確認する。
const CALENDAR_MONTH = '2026-11'

/** 照合の画面で、予定の取り方に Google カレンダーを選び、対象の月と実績の CSV で照合する。 */
const checkWithCalendar = async (page: Page, visits: string) => {
  await page.goto('/receipt')
  await page.getByTestId('receipt-source-calendar').check()
  await expect(page.getByTestId('receipt-source-csv')).not.toBeChecked()
  await page.getByTestId('receipt-month').fill(CALENDAR_MONTH)
  await page.getByTestId('receipt-visits-file').setInputFiles(visits)
  await page.getByTestId('receipt-check-submit').click()
  await expect(page).toHaveURL(/\/receipt\/result$/)
}

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

    test('結果の CSV をダウンロードした場合、BOM 付きの UTF-8 で区分と確認することの列を持ち、区切りの行を持たないこと', async ({
      page,
    }) => {
      const download = page.waitForEvent('download')
      await page.getByTestId('receipt-download').click()
      const file = await (await download).path()

      const bytes = await readFile(file)
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const csv = bytes.subarray(3).toString('utf8')
      expect(csv).toMatch(/^区分,訪問日,利用者名,主訪問者,[^\r\n]*,加算,確認すること\r\n/)
      expect(csv).not.toContain(',---')
      expect(csv).toMatch(/\r\n不整合データ,[^\r\n]*,不一致: /)
      expect(csv).toMatch(/\r\n整合データ,/)
    })
  })

  test.describe('Google カレンダーの予定での照合', () => {
    test('対象の月を選んで照合した場合、その月の Google カレンダーの予定が予定のみの行に出ること', async ({
      page,
    }) => {
      // 実績の CSV は 2024 年 4 月なので、予定は全て予定のみの行になる
      await checkWithCalendar(page, RECEIPT_TESTDATA.visits)
      await expect(page.getByTestId('receipt-result')).toContainText(
        '2026 年 11 月の Google カレンダー',
      )
      await expect(page.getByTestId('receipt-category-visit_only')).toHaveText('実績のみ（7 件）')
      await expect(page.getByTestId('receipt-category-schedule_only')).toBeVisible()

      // 毎週の予定は、取り消した 11 日の回を除き、18 日は置き換えた回の時刻で出る
      // 件数は、先に流れる取り込みの spec の書き出しで変わるので数えない
      const futaba = receiptResultRow(page, '見本二葉')
      await expect(futaba).toContainText(['2026-11-04', '2026-11-18', '2026-11-25'])
      await expect(futaba).toContainText(['09:00', '14:00', '09:00'])
      await expect(futaba.filter({ hasText: '2026-11-11' })).toHaveCount(0)
      // 主訪問者の名前は compose/receipt-calendars.json の staff_name で、シードの職員の名前と同じ
      await expect(futaba.first()).toContainText(LEADER.staff.name)
      await expect(receiptResultRow(page, '見本一郎')).toContainText(['2026-11-02', '2026-11-16'])
    })

    test('対象の月の実績と照合した場合、予定と合う実績が整合の行に、開始時間かサービス内容が違う実績が不整合の行に出ること', async ({
      page,
    }) => {
      await checkWithCalendar(page, RECEIPT_TESTDATA.calendarVisits)

      // 予定の終了時間と提供時間は、訪看I２ と訪看I３ では 1 分減らして比べる。
      // 主訪問者は compose/receipt-calendars.json の staff_name で、シードの職員の名前と同じ
      const mori = LEADER.staff.name

      await showAllReceiptRows(page)

      // 11/02 の見本 一郎は、予定の 10:00〜10:30 の訪看I2 と、開始時間、終了時間、提供時間、サービス内容が合う
      await expect(receiptCategoryRowCells(page, 'match', '2026-11-02', '見本一郎')).toHaveText([
        '2026-11-02',
        '見本一郎',
        mori,
        '',
        '訪看I２',
        '10:00',
        '10:29',
        '29',
        '訪看I２',
        '10:00',
        '10:29',
        '29',
        '通常',
      ])

      // 11/04 の見本 二葉は、予定が 09:00、実績が 09:15 に始まる
      await expect(receiptCategoryRowCells(page, 'mismatch', '2026-11-04', '見本二葉')).toHaveText([
        '2026-11-04',
        '見本二葉',
        mori,
        '開始時間が予定と違う終了時間が予定と違う',
        '訪看I３',
        '09:00（不一致）',
        '09:44（注意）',
        '44',
        '訪看I３',
        '09:15（不一致）',
        '09:59（注意）',
        '44',
        '通常',
      ])

      // 11/18 の見本 二葉は、予定が置き換えた回の 14:00 の訪看I3、実績が同じ時刻の予防訪看I３ である
      await expect(receiptCategoryRowCells(page, 'mismatch', '2026-11-18', '見本二葉')).toHaveText([
        '2026-11-18',
        '見本二葉',
        mori,
        'サービス内容が予定と違う',
        '訪看I３（不一致）',
        '14:00',
        '14:44',
        '44',
        '予防訪看I３（不一致）',
        '14:00',
        '14:44',
        '44',
        '通常',
      ])
    })
  })
})
