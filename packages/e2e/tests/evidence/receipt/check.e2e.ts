import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LOGIN_STAFF, LOGIN_STATE, RECEIPT_TESTDATA } from '../../fixtures/env'
import { showAllReceiptRows } from '../../screens/receipt'
import { receiptCategoryRowCells, receiptResultRow } from '../../selectors/receipt'
import { scrollToRightEnd } from '../../widgets/scroll/actions/scroll'

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む。
// 森のカレンダーは 2026 年 11 月の予定を持つ。
const CALENDAR_MONTH = '2026-11'

/**
 * 2026 年 11 月の実績の CSV（visits_2026-11_utf8.csv）で照合したときに確認する行。
 * 予定の終了時間と提供時間は、訪看I２ と訪看I３ では 1 分減らして比べる。
 */
const CALENDAR_VISIT_CASES = [
  {
    name: 'receipt-calendar-match',
    test: '予定と開始時間、終了時間、提供時間、サービス内容が合う実績と照合した場合、整合の行に出ること',
    title:
      '2026-11 の Google カレンダーの予定と実績で照合すると、11/02 の見本 一郎の予定（10:00〜10:30 の訪看I2）と合う実績が整合の行に出る',
    category: 'match',
    date: '2026年11月2日（月）',
    patient: '見本一郎',
    cells: ['', '訪看I２', '10:00', '10:29', '29', '訪看I２', '10:00', '10:29', '29', '通常'],
    scheduleResult:
      '「整合データ」に 2026-11-02 の見本一郎の行が出て、確認することは空で、予定の側は訪看I２、10:00〜10:29、29 で印が無い',
    visitResult: '実績の側も訪看I２、10:00〜10:29、29 で、予定と同じ値で印が無い',
  },
  {
    name: 'receipt-calendar-mismatch-start',
    test: '予定と開始時間が違う実績と照合した場合、開始時間に印の付いた不整合の行に出ること',
    title:
      '2026-11 の Google カレンダーの予定と実績で照合すると、11/04 の見本 二葉の予定（09:00 開始）と開始時間が違う実績（09:15 開始）が不整合の行に出る',
    category: 'mismatch',
    date: '2026年11月4日（水）',
    patient: '見本二葉',
    cells: [
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
    ],
    scheduleResult:
      '「不整合データ」に 2026-11-04 の見本二葉の行が出て、予定の開始時間 09:00 に不一致の印が、終了時間 09:44 に注意の印が付き、確認することに「開始時間が予定と違う」と「終了時間が予定と違う」が出る',
    visitResult:
      '実績の開始時間 09:15 に不一致の印が、終了時間 09:59 に注意の印が付き、サービス内容と提供時間には印が無い',
  },
  {
    name: 'receipt-calendar-mismatch-service',
    test: '予定とサービス内容が違う実績と照合した場合、サービス内容に印の付いた不整合の行に出ること',
    title:
      '2026-11 の Google カレンダーの予定と実績で照合すると、11/18 の見本 二葉の予定（訪看I3）とサービス内容が違う実績（予防訪看I３）が不整合の行に出る',
    category: 'mismatch',
    date: '2026年11月18日（水）',
    patient: '見本二葉',
    cells: [
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
    ],
    scheduleResult:
      '「不整合データ」に 2026-11-18 の見本二葉の行が出て、予定のサービス内容 訪看I３ に不一致の印が付き、確認することに「サービス内容が予定と違う」と出る',
    visitResult:
      '実績のサービス内容 予防訪看I３ に不一致の印が付き、開始時間と提供時間には印が無い',
  },
] as const

/** 照合の画面を開き、「照合する」が出るまで待つ。 */
const openReceipt = async (page: Page) => {
  await page.goto('/receipt')
  await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
}

/** 予定の取り方に「Google カレンダー」を選び、対象の月に 2026-11 を入れる。 */
const chooseCalendarMonth = (page: Page) =>
  step(page, '予定の取り方に「Google カレンダー」を選び、対象の月に 2026-11 を入れる', async () => {
    await page.getByTestId('receipt-source-calendar').check()
    await page.getByTestId('receipt-month').fill(CALENDAR_MONTH)
  })

test.describe('照合の結果', () => {
  test.describe(`Google カレンダーの予定での照合（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('receipt-calendar-month-check 対象の月を選んで照合した場合、calendarpit の森の予定が予定のみの行に出ること', async ({
      page,
    }) => {
      await openReceipt(page)
      await intro(
        page,
        'ローカル環境の compose で、予定の取り方に「Google カレンダー」を選んで 2026-11 で照合すると、calendarpit の森 健太の予定が予定のみの行に出る',
      )

      await chooseCalendarMonth(page)
      await step(page, '実績の CSV に visits_cp932.csv を選び、「照合する」を押す', async () => {
        await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
        await page.getByTestId('receipt-check-submit').click()
      })
      await check(
        page,
        '503 にならず、2026 年 11 月の Google カレンダーとの照合の結果の画面が開く',
        async () => {
          await expect(page).toHaveURL(/\/receipt\/result$/)
          await expect(page.getByTestId('receipt-result')).toContainText(
            '2026 年 11 月の Google カレンダー',
          )
        },
      )

      await check(
        page,
        '「予定のみ」に、主訪問者が森 健太の、見本一郎と見本二葉の予定の行が出る',
        async () => {
          await page.getByTestId('receipt-category-schedule_only').scrollIntoViewIfNeeded()
          const futaba = receiptResultRow(page, '見本二葉')
          await expect(futaba).toHaveCount(3)
          await expect(futaba.first()).toContainText(LEADER.staff.name)
          await expect(receiptResultRow(page, '見本一郎')).toContainText([
            '2026年11月2日（月）',
            '2026年11月16日（月）',
          ])
        },
      )
    })

    for (const item of CALENDAR_VISIT_CASES) {
      test(`${item.name} 対象の月の、${item.test}`, async ({ page }) => {
        await openReceipt(page)
        await intro(page, item.title)

        await chooseCalendarMonth(page)
        await step(
          page,
          '実績の CSV に visits_2026-11_utf8.csv を選び、「照合する」を押す',
          async () => {
            await page
              .getByTestId('receipt-visits-file')
              .setInputFiles(RECEIPT_TESTDATA.calendarVisits)
            await page.getByTestId('receipt-check-submit').click()
            await expect(page).toHaveURL(/\/receipt\/result$/)
            await expect(page.getByTestId('receipt-result')).toContainText(
              '2026 年 11 月の Google カレンダー',
            )
          },
        )

        if (item.category === 'match') {
          await step(page, '表示する行を「全ての行」に切り替える', () => showAllReceiptRows(page))
        }

        const row = receiptCategoryRowCells(page, item.category, item.date, item.patient)
        const cells = [item.date, item.patient, LEADER.staff.name, ...item.cells]
        await check(page, item.scheduleResult, () => expect(row).toHaveText(cells))

        // 送るのは操作の止めが入らず、step の字幕が読めないので、次の判定の字幕に書く
        await scrollToRightEnd(page.getByTestId('receipt-result-table'))
        await check(
          page,
          `（撮影のため、結果の表を右端まで送り、実績の側の列を見せる）\n${item.visitResult}`,
          () => expect(row).toHaveText(cells),
        )
      })
    }
  })
})
