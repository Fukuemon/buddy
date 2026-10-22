import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_NAME, LOGIN_STAFF, RECEIPT_TESTDATA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtIdp } from '../../screens/login'
import { receiptResultRow } from '../../selectors/receipt'

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む。
// 森のカレンダーは 2026 年 11 月の予定を持ち、実績の CSV は 2024 年 4 月なので、予定は全て予定のみの行になる。
const CALENDAR_MONTH = '2026-11'

const signIn = async (page: Page) => {
  await page.goto('/receipt')
  await signInAtIdp(page, LOGIN_NAME)
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
  })
})
