import { expect, test, type Page } from '@playwright/test'

import { BASE_URL } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { enterEmailAtBroker, signInAtUpstreamIdp } from '../../screens/login'
import { idpLogin } from '../../selectors/idp'

/**
 * 運営用の CLI で、シードに無い組織 org-sample-e に登録した最初のマネージャー。
 * 撮る前に、CONTRIBUTING.md の「事業所と最初のマネージャーを足す」の引数で CLI を流しておく。
 */
const ONBOARDED_MANAGER = { email: 'mao.arai@example.com', name: '新井真央' }

/** 録画の外では、ログインせずに web の origin を開いておく。録画の中で、ログインの画面から操作する。 */
const openWeb = async (page: Page) => {
  await page.goto(`${BASE_URL}/auth/error`)
}

test.describe('職員の管理', () => {
  test.describe('事業所と最初のマネージャーの登録', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}運営用の CLI で登録したマネージャーが上流の IdP でログインした場合、職員の一覧に自分が有効で出て、職員を登録のボタンが出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'onboard-manager-login',
            title: 'CLI で登録したマネージャーでログインすると、職員の画面を開ける',
            actor: `${ONBOARDED_MANAGER.name}（CLI で登録した 5 つ目の事業所のマネージャー）`,
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto('/staff')
            await step('CLI で事業所と最初のマネージャーを登録した後、職員の一覧を開く')

            await step(`ブローカーで、メールに ${ONBOARDED_MANAGER.email} を入れて「次へ」を押す`)
            await enterEmailAtBroker(page, ONBOARDED_MANAGER.email)
            await expect(idpLogin(page).username).toBeVisible()

            await step('5 つ目の事業所の上流の IdP（フェイク）で、同じメールを確認済みにして入る')
            await signInAtUpstreamIdp(page, ONBOARDED_MANAGER.email)
            await expect(page.getByTestId('viewer-menu')).toContainText(ONBOARDED_MANAGER.name)
            const row = page
              .getByTestId(/^staff-list-row-/)
              .filter({ hasText: ONBOARDED_MANAGER.name })
            await expect(row).toBeVisible()
            await expect(row).toContainText('有効')
            await expect(row).toContainText('マネージャー')
            await expect(page.getByTestId('staff-list-new')).toBeVisible()
            await check(
              `職員の一覧に ${ONBOARDED_MANAGER.name} が「有効」と「マネージャー」で出て、「職員を登録」のボタンが出る`,
            )
          },
        )
      })
    }
  })
})
