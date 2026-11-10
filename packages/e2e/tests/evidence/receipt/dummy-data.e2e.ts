import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_EMAIL, LOGIN_STAFF, RECEIPT_TESTDATA } from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { signInAtUpstreamIdp } from '../../screens/login'
import { receiptCategoryRowCells, receiptWarningItems } from '../../selectors/receipt'

/** 照合の画面で、予定と実績のダミーの CSV を選んで照合し、結果の画面へ移る。フェイクは入力によらず決まった結果を返す。 */
const checkWithCsv = async (page: Page) => {
  await page.getByTestId('receipt-source-csv').check()
  await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
  await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
  await page.getByTestId('receipt-check-submit').click()
  await expect(page).toHaveURL(/\/receipt\/result$/)
}

/** src/mocks/receiptData.ts の mockReceiptReport の 4 つの区分と、照合に使わなかった予定が、結果の画面に出ることを確認する。 */
const expectMockReport = async (page: Page) => {
  for (const category of ['mismatch', 'schedule_only', 'visit_only', 'match'] as const)
    await expect(page.getByTestId(`receipt-category-label-${category}`)).toContainText('（1 件）')
  await expect(
    receiptCategoryRowCells(page, 'mismatch', '2024年4月1日（月）', '加藤 春子').first(),
  ).toBeVisible()
  await expect(receiptWarningItems(page)).toHaveCount(1)
}

/** 照合の画面を開いてから、ダミーの CSV で照合し、ダミーデータの結果が出ることを撮る。 */
const recordMockCheck = async (page: Page, title: string) => {
  await page.goto('/receipt')
  await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
  await intro(page, title)

  await step(page, '予定と実績のダミーの CSV を選び、照合する', () => checkWithCsv(page))
  await check(page, '4 つの区分が 1 件ずつと、照合に使わなかった予定が 1 件出る', () =>
    expectMockReport(page),
  )
}

// どちらも compose ではなく、web の開発サーバーに E2E_BASE_URL を向けて撮る。
// 開発サーバーにはブローカーが無く setup の project のログインが通らないので、--no-deps で流す
test.describe('照合', () => {
  test.describe('フェイクの照合の結果（ログインなし、fake のダミーの職員）', () => {
    // E2E_BASE_URL を、VITE_API_MODE を指定しない開発サーバー（pnpm --filter @buddy/web dev）に向けて撮る
    test('receipt-dummy-data-fake VITE_API_MODE を指定せずに起動して照合した場合、ダミーデータの照合の結果を出すこと', async ({
      page,
    }) => {
      await recordMockCheck(
        page,
        'VITE_API_MODE を指定しない開発サーバーで照合すると、ダミーデータの結果が出る',
      )
    })
  })

  test.describe(`フェイクの照合の結果（${LOGIN_STAFF.name}、マネージャー）`, () => {
    // E2E_BASE_URL を dev:msw の開発サーバーに向けて撮る。ログインは compose の上流の IdP のフェイクに直に入る
    test('receipt-dummy-data-msw dev:msw で起動して照合した場合、ダミーデータの照合の結果を出すこと', async ({
      browser,
      context,
    }) => {
      await prepareOutsideRecording(browser, { carryLoginTo: context }, async (page) => {
        await page.goto('/receipt')
        await signInAtUpstreamIdp(page, LOGIN_EMAIL)
        await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
      })

      await recordMockCheck(
        await context.newPage(),
        'dev:msw の開発サーバーで照合すると、MSW の handler がダミーデータの結果を返す',
      )
    })
  })
})
