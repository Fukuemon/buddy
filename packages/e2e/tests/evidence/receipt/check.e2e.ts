import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF, RECEIPT_TESTDATA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { receiptCategoryRowCells, receiptResultRow } from '../../selectors/receipt'

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
    date: '2026-11-02',
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
    date: '2026-11-04',
    patient: '見本二葉',
    cells: [
      '開始時間が予定と違う',
      '訪看I３',
      '09:00（不一致）',
      '09:44',
      '44',
      '訪看I３',
      '09:15（不一致）',
      '09:59',
      '44',
      '通常',
    ],
    scheduleResult:
      '「不整合データ」に 2026-11-04 の見本二葉の行が出て、予定の開始時間 09:00 に不一致の印が付き、確認することに「開始時間が予定と違う」と出る',
    visitResult: '実績の開始時間 09:15 に不一致の印が付き、サービス内容と提供時間には印が無い',
  },
  {
    name: 'receipt-calendar-mismatch-service',
    test: '予定とサービス内容が違う実績と照合した場合、サービス内容に印の付いた不整合の行に出ること',
    title:
      '2026-11 の Google カレンダーの予定と実績で照合すると、11/18 の見本 二葉の予定（訪看I3）とサービス内容が違う実績（予防訪看I３）が不整合の行に出る',
    category: 'mismatch',
    date: '2026-11-18',
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

const signIn = async (page: Page) => {
  await page.goto('/receipt')
  await signInAtBroker(page, LOGIN_EMAIL)
}

test.describe('照合の結果', () => {
  test.describe('Google カレンダーの予定での照合', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}対象の月を選んで照合した場合、calendarpit の森の予定が予定のみの行に出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-calendar-month-check',
            title:
              'ローカル環境の compose で、予定の取り方に「Google カレンダー」を選んで 2026-11 で照合すると、calendarpit の森 健太の予定が予定のみの行に出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto('/receipt')
            await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
            await step('照合の画面を開いている')

            await step('予定の取り方に「Google カレンダー」を選び、対象の月に 2026-11 を入れる')
            await page.getByTestId('receipt-source-calendar').check()
            await page.getByTestId('receipt-month').fill(CALENDAR_MONTH)

            await step('実績の CSV に visits_cp932.csv を選び、「照合する」を押す')
            await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
            await page.getByTestId('receipt-check-submit').click()
            await expect(page).toHaveURL(/\/receipt\/result$/)
            await expect(page.getByTestId('receipt-result')).toContainText(
              '2026 年 11 月の Google カレンダー',
            )
            await check('503 にならず、2026 年 11 月の Google カレンダーとの照合の結果の画面が開く')

            const category = page.getByTestId('receipt-category-schedule_only')
            await category.scrollIntoViewIfNeeded()
            const futaba = receiptResultRow(page, '見本二葉')
            await expect(futaba).toHaveCount(3)
            await expect(futaba.first()).toContainText(LEADER.staff.name)
            await expect(receiptResultRow(page, '見本一郎')).toContainText([
              '2026-11-02',
              '2026-11-16',
            ])
            await check('「予定のみ」に、主訪問者が森 健太の、見本一郎と見本二葉の予定の行が出る')
          },
        )
      })
    }

    for (const item of CALENDAR_VISIT_CASES) {
      for (const variant of EVIDENCE_VARIANTS) {
        test(`${variant.label ? `${variant.label}: ` : ''}対象の月の、${item.test}`, async ({
          browser,
        }) => {
          await recordPrEvidence(
            browser,
            {
              name: item.name,
              title: item.title,
              actor: `${LOGIN_STAFF.name}（マネージャー）`,
              variant,
            },
            signIn,
            async ({ page, step, check }) => {
              await page.goto('/receipt')
              await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
              await step('照合の画面を開いている')

              await step('予定の取り方に「Google カレンダー」を選び、対象の月に 2026-11 を入れる')
              await page.getByTestId('receipt-source-calendar').check()
              await page.getByTestId('receipt-month').fill(CALENDAR_MONTH)

              await step('実績の CSV に visits_2026-11_utf8.csv を選び、「照合する」を押す')
              await page
                .getByTestId('receipt-visits-file')
                .setInputFiles(RECEIPT_TESTDATA.calendarVisits)
              await page.getByTestId('receipt-check-submit').click()
              await expect(page).toHaveURL(/\/receipt\/result$/)
              await expect(page.getByTestId('receipt-result')).toContainText(
                '2026 年 11 月の Google カレンダー',
              )

              const row = receiptCategoryRowCells(page, item.category, item.date, item.patient)
              await expect(row).toHaveText([
                item.date,
                item.patient,
                LEADER.staff.name,
                ...item.cells,
              ])
              await check(item.scheduleResult)

              await step('（撮影のため、結果の表を右端まで送り、実績の側の列を見せる）')
              await page.getByTestId('receipt-result-table').evaluate((element) => {
                element.scrollLeft = element.scrollWidth
              })
              await expect(row).toHaveText([
                item.date,
                item.patient,
                LEADER.staff.name,
                ...item.cells,
              ])
              await check(item.visitResult)
            },
          )
        })
      }
    }
  })
})
