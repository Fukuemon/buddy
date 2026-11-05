import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, RECEIPT_TESTDATA, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { pageRoot } from '../../selectors/page'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** マネージャーでログインし、path の画面を開いたまま返す。 */
const signInAt = (path: string) => async (page: Page) => {
  await page.goto(path)
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** 文書の全体の横幅が、スマートフォンの幅を超えないこと。表の中の横送りは、文書の横幅に入らない。 */
const expectNoHorizontalScroll = async (page: Page) => {
  await expect
    .poll(() => pageRoot(page).evaluate((root) => root.scrollWidth))
    .toBeLessThanOrEqual(PHONE_VIEWPORT.width)
}

test.describe('スマートフォンの幅', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}幅 390px で予定のカレンダーを開いた場合、ページが横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'phone-width-schedule',
          title: '幅 390px で予定のカレンダーを開くと、ページが横にスクロールしない',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInAt('/schedule'),
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('schedule-calendar')).toBeVisible()
          await step('幅 390px で予定のカレンダーを開いている')
          await expectNoHorizontalScroll(page)
          await check('ページが横にスクロールしない')
        },
      )
    })

    test(`${prefix}幅 390px で利用者の一覧と詳細を開いた場合、ページが横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'phone-width-patients',
          title: '幅 390px で利用者の一覧と詳細を開くと、ページが横にスクロールしない',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInAt('/patients'),
        async ({ page, step, check }) => {
          await page.goto('/patients')
          await expect(page.getByTestId('patient-list-table')).toBeVisible()
          await step('幅 390px で利用者の一覧を開いている')
          await expectNoHorizontalScroll(page)
          await check('一覧のページが横にスクロールしない')

          await page.goto(`/patients/${SEED_PATIENT.id}`)
          await expect(page.getByTestId('patient-detail-name')).toHaveText(SEED_PATIENT.name)
          await step(`幅 390px で利用者「${SEED_PATIENT.name}」の詳細を開いている`)
          await expectNoHorizontalScroll(page)
          await check('詳細のページが横にスクロールしない')
        },
      )
    })

    test(`${prefix}幅 390px で部署とチームの画面を開いた場合、ページが横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'phone-width-organization',
          title: '幅 390px で部署とチームの画面を開くと、ページが横にスクロールしない',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInAt('/organization'),
        async ({ page, step, check }) => {
          await page.goto('/organization')
          await expect(page.getByTestId('organization-list-department-table')).toBeVisible()
          await expect(page.getByTestId('organization-list-team-table')).toBeVisible()
          await step('幅 390px で部署とチームの画面を開いている')
          await expectNoHorizontalScroll(page)
          await check('ページが横にスクロールしない')
        },
      )
    })

    test(`${prefix}幅 390px で照合の画面を開いた場合、ページが横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'phone-width-receipt',
          title: '幅 390px で照合の画面を開くと、ページが横にスクロールしない',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInAt('/receipt'),
        async ({ page, step, check }) => {
          await page.goto('/receipt')
          await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
          await step('幅 390px で照合の画面を開いている')
          await expectNoHorizontalScroll(page)
          await check('ページが横にスクロールしない')
        },
      )
    })

    test(`${prefix}幅 390px で照合の結果を開いた場合、表の中の横送りを除いてページが横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'phone-width-receipt-result',
          title:
            '幅 390px で照合の結果を開くと、表の中の横送りを除いて、ページが横にスクロールしない',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInAt('/receipt'),
        async ({ page, step, check }) => {
          await page.goto('/receipt')
          await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
          await step('幅 390px で照合の画面を開き、予定と実績のダミーの CSV で照合する')
          await page.getByTestId('receipt-source-csv').check()
          await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
          await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
          await page.getByTestId('receipt-check-submit').click()
          await expect(page).toHaveURL(/\/receipt\/result$/)
          await expect(page.getByTestId('receipt-result-table')).toBeVisible()
          await check('照合の結果を開いている')

          await step('(撮影のため、ページを右端まで横に送る)')
          await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0))
          await expectNoHorizontalScroll(page)
          await expect.poll(() => page.evaluate(() => window.scrollX)).toBe(0)
          await check('ページが横にスクロールしない。結果の表は表の箱の中で横に送る')
        },
      )
    })
  }
})
