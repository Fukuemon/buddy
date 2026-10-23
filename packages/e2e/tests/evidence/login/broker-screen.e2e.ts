import { expect, test, type Locator, type Page } from '@playwright/test'

import { BROKER_URL } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { brokerPage } from '../../selectors/broker'
import { brokerLogin } from '../../selectors/idp'

/** 録画の外では、ログインせずに web の origin を開いておく。録画の中で、ブローカーの画面を開く。 */
const openWeb = async (page: Page) => {
  await page.goto('/auth/error')
}

/** 要素の文字の色と、背景の色。CSS の rgb() の 3 つの値で返す。 */
const colorsOf = (locator: Locator) =>
  locator.evaluate((element) => {
    const rgb = (value: string) => (value.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    let background = element as Element | null
    while (background && getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)')
      background = background.parentElement
    return {
      foreground: rgb(getComputedStyle(element).color),
      background: rgb(getComputedStyle(background ?? document.body).backgroundColor),
    }
  })

/** WCAG 2.2 のコントラスト比を、小数 2 桁で返す。 */
const contrastRatio = ({
  foreground,
  background,
}: {
  foreground: number[]
  background: number[]
}) => {
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((value) => {
      const channel = value / 255
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return Math.floor(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
}

test.describe('ログイン', () => {
  test.describe('ブローカーの画面', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}デスクトップの幅でログインの画面を開いた場合、背景の中央の白いカードにロゴ、メールアドレスの欄、幅いっぱいのボタンが縦に並ぶこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'broker-login-desktop',
            title:
              'デスクトップの幅でブローカーのログインの画面を開くと、背景の中央の白いカードに、ロゴ、メールアドレスの欄、幅いっぱいのボタンが縦に並ぶ',
            actor: 'ログインなし',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await step('ログインせずに予定のカレンダーを開く')
            await page.goto('/schedule')
            const broker = brokerLogin(page)
            await expect(broker.email).toBeVisible()
            await check('ブローカーのメールアドレスの入力の画面が出る')

            const button = contrastRatio(await colorsOf(broker.next))
            const label = contrastRatio(await colorsOf(brokerPage(page).emailLabel))
            await step('(撮影のため、文字と背景のコントラスト比を、画面の色から計算する)')
            expect(button).toBeGreaterThanOrEqual(4.5)
            expect(label).toBeGreaterThanOrEqual(4.5)
            await check(
              `「次へ」の文字とボタンは ${button}:1、ラベルとカードは ${label}:1 で、どちらも 4.5:1 以上`,
            )
          },
        )
      })

      test(`${prefix}スマートフォンの幅でログインの画面を開いた場合、カードが画面の幅に収まり、横にスクロールしないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'broker-login-phone',
            title:
              'スマートフォンの幅でブローカーのログインの画面を開くと、カードが画面の幅に収まり、横にスクロールしない',
            actor: 'ログインなし',
            variant,
            viewport: PHONE_VIEWPORT,
          },
          openWeb,
          async ({ page, step, check }) => {
            await step('ログインせずに、幅 390px で予定のカレンダーを開く')
            await page.goto('/schedule')
            await expect(brokerLogin(page).email).toBeVisible()
            const width = await page.evaluate(() => ({
              scroll: document.documentElement.scrollWidth,
              client: document.documentElement.clientWidth,
            }))
            expect(width.scroll).toBeLessThanOrEqual(width.client)
            await check(
              `ブローカーのメールアドレスの入力の画面が出て、横に送れる幅（${width.scroll}px）が画面の幅（${width.client}px）を超えない`,
            )
          },
        )
      })

      test(`${prefix}ブローカーがログインの結果を返せない場合、ログインの失敗の画面が同じカードの形で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'broker-login-failure',
            title:
              'ブローカーがログインの結果を Hydra へ返せないと、ログインの失敗の画面が同じカードの形で出る',
            actor: 'ログインなし',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await step('login_challenge を付けずに、ブローカーのログインの画面を開く')
            await page.goto(`${BROKER_URL}/login`)
            await expect(brokerPage(page).heading).toHaveText('ログインできませんでした')
            await check('「ログインできませんでした」の画面が出る')
          },
        )
      })
    }
  })
})
