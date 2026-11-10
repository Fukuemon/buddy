import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, RECEIPT_TESTDATA, SEED_PATIENT } from '../../fixtures/env'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { pageRoot } from '../../selectors/page'

/** 文書の全体の横幅が、スマートフォンの幅を超えないこと。表の中の横送りは、文書の横幅に入らない。 */
const expectNoHorizontalScroll = async (page: Page) => {
  await expect
    .poll(() => pageRoot(page).evaluate((root) => root.scrollWidth))
    .toBeLessThanOrEqual(PHONE_VIEWPORT.width)
}

test.describe('スマートフォンの幅', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）、幅 390px`, () => {
    test.use({ storageState: LOGIN_STATE, viewport: PHONE_VIEWPORT })

    test('phone-width-schedule 幅 390px で予定のカレンダーを開いた場合、ページが横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('schedule-calendar')).toBeVisible()
      await intro(
        page,
        '幅 390px で予定のカレンダーを開くと、ページが横にスクロールしない\n前提 幅 390px で予定のカレンダーを開いている',
      )

      await check(page, 'ページが横にスクロールしない', () => expectNoHorizontalScroll(page))
    })

    test('phone-width-patients 幅 390px で利用者の一覧と詳細を開いた場合、ページが横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto('/patients')
      await expect(page.getByTestId('patient-list-table')).toBeVisible()
      await intro(
        page,
        '幅 390px で利用者の一覧と詳細を開くと、ページが横にスクロールしない\n前提 幅 390px で利用者の一覧を開いている',
      )

      await check(page, '一覧のページが横にスクロールしない', () => expectNoHorizontalScroll(page))

      await step(page, `利用者「${SEED_PATIENT.name}」の詳細を開く`, async () => {
        await page.goto(`/patients/${SEED_PATIENT.id}`)
        await expect(page.getByTestId('patient-detail-name')).toHaveText(SEED_PATIENT.name)
      })
      await check(page, '詳細のページが横にスクロールしない', () => expectNoHorizontalScroll(page))
    })

    test('phone-width-organization 幅 390px で部署とチームの画面を開いた場合、ページが横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto('/organization')
      await expect(page.getByTestId('organization-list-department-table')).toBeVisible()
      await expect(page.getByTestId('organization-list-team-table')).toBeVisible()
      await intro(
        page,
        '幅 390px で部署とチームの画面を開くと、ページが横にスクロールしない\n前提 幅 390px で部署とチームの画面を開いている',
      )

      await check(page, 'ページが横にスクロールしない', () => expectNoHorizontalScroll(page))
    })

    test('phone-width-receipt 幅 390px で照合の画面を開いた場合、ページが横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
      await intro(
        page,
        '幅 390px で照合の画面を開くと、ページが横にスクロールしない\n前提 幅 390px で照合の画面を開いている',
      )

      await check(page, 'ページが横にスクロールしない', () => expectNoHorizontalScroll(page))
    })

    test('phone-width-receipt-result 幅 390px で照合の結果を開いた場合、表の中の横送りを除いてページが横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
      await intro(
        page,
        '幅 390px で照合の結果を開くと、表の中の横送りを除いて、ページが横にスクロールしない\n前提 幅 390px で照合の画面を開いている',
      )

      await step(page, '予定と実績のダミーの CSV で照合する', async () => {
        await page.getByTestId('receipt-source-csv').check()
        await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
        await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
        await page.getByTestId('receipt-check-submit').click()
      })
      await check(page, '照合の結果を開いている', async () => {
        await expect(page).toHaveURL(/\/receipt\/result$/)
        await expect(page.getByTestId('receipt-result-table')).toBeVisible()
      })

      await step(page, '（撮影のため、ページを右端まで横に送る）', () =>
        page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0)),
      )
      await check(
        page,
        'ページが横にスクロールしない。結果の表は表の箱の中で横に送る',
        async () => {
          await expectNoHorizontalScroll(page)
          await expect.poll(() => page.evaluate(() => window.scrollX)).toBe(0)
        },
      )
    })
  })
})
