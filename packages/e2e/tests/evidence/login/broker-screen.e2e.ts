import { expect, test, type Locator, type Page } from '@playwright/test'

import { BROKER_URL } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { brokerPage } from '../../selectors/broker'
import { pageBody } from '../../selectors/page'
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
            // 字幕は開いた画面の sessionStorage に置くので、画面を開いてから最初の字幕を出す
            await page.goto('/schedule')
            const broker = brokerLogin(page)
            await expect(broker.email).toBeVisible()
            await step('ログインせずに予定のカレンダーを開いた')
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

      test(`${prefix}ログインの画面を開いた場合、メールアドレスを入れるとふだん使っているログインの画面が開くという補足が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'broker-login-hint',
            title:
              'ブローカーのログインの画面を開くと、メールアドレスの欄の下に「事業所に登録したメールアドレスを入れると、ふだん使っているログインの画面が開きます。」が出る',
            actor: 'ログインなし',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await expect(brokerLogin(page).email).toBeVisible()
            const hint = brokerPage(page).emailHint
            await expect(hint).toHaveText(
              '事業所に登録したメールアドレスを入れると、ふだん使っているログインの画面が開きます。',
            )
            await expect(pageBody(page)).not.toContainText('事業所のログインの画面')
            await step('ログインせずに予定のカレンダーを開いた')
            await check(
              'メールアドレスの欄の下に「事業所に登録したメールアドレスを入れると、ふだん使っているログインの画面が開きます。」が出て、「事業所のログインの画面」の語は出ない',
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
            await page.goto('/schedule')
            await expect(brokerLogin(page).email).toBeVisible()
            await step('ログインせずに、幅 390px で予定のカレンダーを開いた')
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

      test(`${prefix}メールアドレスの欄にフォーカスを当てた場合、web の focus-ring と同じフォーカスの表示が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'broker-login-focus',
            title:
              'ブローカーのログインの画面でメールアドレスの欄にフォーカスを当てると、packages/ui の focus-ring と同じ 4px の線と 2px の間隔のフォーカスの表示が出る',
            actor: 'ログインなし',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            const email = brokerLogin(page).email
            await expect(email).toBeVisible()
            await step('ログインせずに予定のカレンダーを開いた')

            await step('メールアドレスの欄を押す')
            await email.click()
            await expect(email).toBeFocused()
            const outline = await email.evaluate((element) => {
              const style = getComputedStyle(element)
              return `${style.outlineStyle} ${style.outlineWidth}、間隔 ${style.outlineOffset}`
            })
            expect(outline).toBe('solid 4px、間隔 2px')
            await check(`メールアドレスの欄に、${outline} のフォーカスの線が出る`)
          },
        )
      })

      test(`${prefix}ログインの途中の値を付けずにブローカーの画面を開いた場合、ログインを続けられない画面が同じカードの形で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'broker-login-failure',
            title:
              'login_challenge を付けずにブローカーの画面を開くと、ログインを続けられない画面が同じカードの形で出る',
            actor: 'ログインなし',
            variant,
          },
          openWeb,
          async ({ page, step, check }) => {
            await page.goto(`${BROKER_URL}/login`)
            await expect(brokerPage(page).heading).toHaveText('ログインを続けられませんでした')
            await step('login_challenge を付けずに、ブローカーのログインの画面を開いた')
            await check('「ログインを続けられませんでした」の画面が出る')
          },
        )
      })
    }
  })
})
