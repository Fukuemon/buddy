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
      await expect(futaba).toContainText([
        '2026年11月4日（水）',
        '2026年11月18日（水）',
        '2026年11月25日（水）',
      ])
      await expect(futaba).toContainText(['09:00', '14:00', '09:00'])
      await expect(futaba.filter({ hasText: '2026年11月11日（水）' })).toHaveCount(0)
      // 主訪問者の名前は compose/receipt-calendars.json の staff_name で、シードの職員の名前と同じ
      await expect(futaba.first()).toContainText(LEADER.staff.name)
      await expect(receiptResultRow(page, '見本一郎')).toContainText([
        '2026年11月2日（月）',
        '2026年11月16日（月）',
      ])
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
      await expect(
        receiptCategoryRowCells(page, 'match', '2026年11月2日（月）', '見本一郎'),
      ).toHaveText([
        '2026年11月2日（月）',
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
      await expect(
        receiptCategoryRowCells(page, 'mismatch', '2026年11月4日（水）', '見本二葉'),
      ).toHaveText([
        '2026年11月4日（水）',
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
      await expect(
        receiptCategoryRowCells(page, 'mismatch', '2026年11月18日（水）', '見本二葉'),
      ).toHaveText([
        '2026年11月18日（水）',
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
