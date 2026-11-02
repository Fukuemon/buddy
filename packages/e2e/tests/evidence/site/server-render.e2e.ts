import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { pageHeading } from '../../selectors/page'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

// 画面の JavaScript を止め、サーバーが描画した HTML だけを出す。字幕は page.evaluate で出すので止まらない
const blockScripts = (page: Page) =>
  page.route('**/*', (route) =>
    route.request().resourceType() === 'script' ? route.abort() : route.fallback(),
  )

const allowScripts = (page: Page) => page.unroute('**/*')

test.describe('サーバーでの描画', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    // E2E_BASE_URL を compose の web（VITE_API_MODE=bff）に向けて撮る
    test(`${prefix}bff のモードで、JavaScript を止めて職員と利用者と部署とチームの画面を開いた場合、サーバーで描画した HTML に見出しと一覧が入っていること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'server-render-bff',
          title: 'bff のモードで、サーバーで描画した HTML に見出しと一覧が入る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/staff')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await page.goto('/staff')
          await step('画面の JavaScript を止める')
          await blockScripts(page)

          await step('職員の画面を開き直す')
          await page.goto('/staff')
          await expect(pageHeading(page, '職員')).toBeVisible()
          await expect(page.getByTestId(`staff-list-row-${LOGIN_STAFF.id}`)).toBeVisible()
          await check('JavaScript を止めても、職員の見出しと一覧が出る')

          await step('利用者の画面を開く')
          await page.goto('/patients')
          await expect(pageHeading(page, '利用者')).toBeVisible()
          await expect(page.getByTestId(`patient-list-row-${SEED_PATIENT.id}`)).toBeVisible()
          await check('JavaScript を止めても、利用者の見出しと一覧が出る')

          await step('部署とチームの画面を開く')
          await page.goto('/organization')
          await expect(pageHeading(page, '部署とチーム')).toBeVisible()
          await check('JavaScript を止めても、部署とチームの見出しと一覧が出る')

          await step('JavaScript を戻し、職員の画面を開き直す')
          await allowScripts(page)
          await page.goto('/staff')
          await page.getByTestId('staff-list-search').fill(LOGIN_STAFF.name)
          await expect(page.getByTestId('staff-list-count')).toHaveText('1 人')
          await check('JavaScript を戻すと、名前で絞り込める')
        },
      )
    })

    // E2E_BASE_URL を VITE_API_MODE=fake の開発サーバーに向けて撮る。fake はログインしない
    test(`${prefix}fake のモードで職員の画面を開いた場合、サーバーでは描画せず、ブラウザで描画して動くこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'server-render-fake',
          title: 'fake のモードでは、職員の画面をブラウザでだけ描画する',
          actor: 'ログインなし（fake のダミーの職員）',
          variant,
        },
        async (page) => {
          await page.goto('/staff')
        },
        async ({ page, step, check }) => {
          await step('画面の JavaScript を止めて、職員の画面を開く')
          await blockScripts(page)
          await page.goto('/staff')
          await expect(pageHeading(page, '職員')).toHaveCount(0)
          await check('サーバーは職員の画面を描画しないので、見出しも一覧も出ない')

          await step('JavaScript を戻し、職員の画面を開き直す')
          await allowScripts(page)
          await page.goto('/staff')
          await expect(pageHeading(page, '職員')).toBeVisible()
          await expect(page.getByTestId('staff-list-count')).toBeVisible()
          await check('ブラウザで描画し、職員の見出しと一覧が出る')

          await step('名前で絞り込む')
          await page.getByTestId('staff-list-search').fill('青木')
          await expect(page.getByTestId('staff-list-count')).toHaveText('1 人')
          await check('名前で絞り込める')
        },
      )
    })
  }
})
