import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { enterEmailAtBroker, signInAtUpstreamIdp } from '../../screens/login'
import { idpLogin } from '../../selectors/idp'

/**
 * 運営用の CLI で、シードに無い組織 org-sample-e に登録した最初のマネージャー。
 * 撮る前に、CONTRIBUTING.md の「事業所と最初のマネージャーを足す」の引数で CLI を流しておく。
 */
const ONBOARDED_MANAGER = { email: 'mao.arai@example.com', name: '新井真央' }

// ログインそのものが観点なので、storageState を読まず、ログインの画面から録画する
test.describe('職員の管理', () => {
  test.describe('事業所と最初のマネージャーの登録', () => {
    test.describe(`${ONBOARDED_MANAGER.name}（CLI で登録した 5 つ目の事業所のマネージャー）`, () => {
      test('onboard-manager-login 運営用の CLI で登録したマネージャーが上流の IdP でログインした場合、職員の一覧に自分が有効で出て、職員を登録のボタンが出ること', async ({
        page,
      }) => {
        // 録画の始めは、ログインせずに web の origin を開いておく
        await page.goto('/auth/error')
        await intro(
          page,
          'CLI で登録したマネージャーでログインすると、職員の画面を開ける\n前提 運営用の CLI で、5 つ目の事業所と最初のマネージャーを登録した',
        )

        await step(page, '職員の一覧を開く', async () => {
          await page.goto('/staff')
        })
        await step(
          page,
          `ブローカーで、メールに ${ONBOARDED_MANAGER.email} を入れて「次へ」を押す`,
          async () => {
            await enterEmailAtBroker(page, ONBOARDED_MANAGER.email)
            await expect(idpLogin(page).username).toBeVisible()
          },
        )
        await step(
          page,
          '5 つ目の事業所の上流の IdP（フェイク）で、同じメールを確認済みにして入る',
          () => signInAtUpstreamIdp(page, ONBOARDED_MANAGER.email),
        )
        const row = page.getByTestId(/^staff-list-row-/).filter({ hasText: ONBOARDED_MANAGER.name })
        await check(
          page,
          `職員の一覧に ${ONBOARDED_MANAGER.name} が、状態が「有効」の一覧に「マネージャー」で出て、「職員を登録」のボタンが出る`,
          async () => {
            await expect(page.getByTestId('viewer-menu')).toContainText(ONBOARDED_MANAGER.name)
            await expect(row).toBeVisible()
            // 一覧は、開いた直後に状態が有効の職員だけを出し、行に状態を書かない
            await expect(page.getByTestId('staff-list-filter-status')).toHaveValue('active')
            await expect(row).toContainText('マネージャー')
            await expect(page.getByTestId('staff-list-new')).toBeVisible()
          },
        )
      })
    })
  })
})
