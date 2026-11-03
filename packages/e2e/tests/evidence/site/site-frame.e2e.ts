import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** ヘッダーのナビゲーションの開閉のボタンと、ナビゲーションの要確認の項目の位置。照合待ちのバッジは要確認の項目の中に出る。 */
const framePosition = async (page: Page) => {
  const toggle = await page.getByTestId('site-nav-toggle').boundingBox()
  const review = await page.getByTestId('site-nav-review').boundingBox()
  return {
    toggle: { x: toggle?.x, y: toggle?.y },
    review: { x: review?.x, y: review?.y, width: review?.width },
  }
}

test.describe('画面の枠', () => {
  test.describe('画面をまたいだ枠の位置と出し分け', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}職員の管理の権限を持つ職員が予定、職員、利用者、組織、照合の画面を順に開いた場合、予定の画面に枠が出て、ほかの 4 つの画面でヘッダーとナビの要確認の項目が同じ位置に出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-frame-same-position',
            title:
              '予定、職員、利用者、組織、照合の画面で、ヘッダーとナビと要確認の項目が同じ位置に出る',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await step('予定の画面を開く')
            await page.goto('/schedule')
            await expect(page.getByTestId('site-nav')).toBeVisible()
            await expect(page.getByTestId('site-nav-review')).toBeVisible()
            await check('予定の画面は、ナビゲーションをレールで始め、ヘッダーと要確認の項目を出す')

            const screens = [
              { url: '/staff', label: '職員' },
              { url: '/patients', label: '利用者' },
              { url: '/organization', label: '部署とチーム' },
              { url: '/receipt', label: '照合' },
            ]
            let first: Awaited<ReturnType<typeof framePosition>> | undefined
            for (const { url, label } of screens) {
              await step(`${label}の画面を開く`)
              await page.goto(url)
              await expect(page.getByTestId('site-nav-review')).toBeVisible()
              const position = await framePosition(page)
              first ??= position
              expect(position).toEqual(first)
              await check(
                `${label}の画面で、ヘッダーの開閉のボタンと要確認の項目が、職員の画面と同じ位置に出る`,
              )
            }
          },
        )
      })

      test(`${prefix}ログインに失敗して /auth/error を開いた場合、画面の枠を出さないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'site-frame-auth-error',
            title: 'ログインの失敗の画面（/auth/error）には、画面の枠を出さない',
            actor: 'ログインなし',
            variant,
          },
          async (page) => {
            await page.goto('/auth/error')
          },
          async ({ page, step, check }) => {
            await step('ログインの失敗の画面を開く')
            await page.goto('/auth/error')
            await expect(page.getByTestId('auth-error-login')).toBeVisible()
            await expect(page.getByTestId('site-nav')).toHaveCount(0)
            await expect(page.getByTestId('site-nav-toggle')).toHaveCount(0)
            await check('ログインの失敗の案内だけを出し、ヘッダーとナビゲーションを出さない')
          },
        )
      })
    }
  })
})
