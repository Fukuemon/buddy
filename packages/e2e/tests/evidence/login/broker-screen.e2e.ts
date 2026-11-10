import { expect, test, type Locator } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { BROKER_URL } from '../../fixtures/env'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { brokerPage } from '../../selectors/broker'
import { brokerLogin } from '../../selectors/idp'
import { pageBody } from '../../selectors/page'

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
  test.describe('ブローカーの画面（ログインなし）', () => {
    test('broker-login-desktop デスクトップの幅でログインの画面を開いた場合、背景の中央の白いカードにロゴ、メールアドレスの欄、幅いっぱいのボタンが縦に並ぶこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      const broker = brokerLogin(page)
      await expect(broker.email).toBeVisible()
      await intro(
        page,
        'デスクトップの幅でブローカーのログインの画面を開くと、背景の中央の白いカードに、ロゴ、メールアドレスの欄、幅いっぱいのボタンが縦に並ぶ\n前提 ログインせずに予定のカレンダーを開いた',
      )

      await check(page, 'ブローカーのメールアドレスの入力の画面が出る', () =>
        expect(broker.email).toBeVisible(),
      )
      let button = 0
      let label = 0
      await step(
        page,
        '(撮影のため、文字と背景のコントラスト比を、画面の色から計算する)',
        async () => {
          button = contrastRatio(await colorsOf(broker.next))
          label = contrastRatio(await colorsOf(brokerPage(page).emailLabel))
        },
      )
      await check(
        page,
        `「次へ」の文字とボタンは ${button}:1、ラベルとカードは ${label}:1 で、どちらも 4.5:1 以上`,
        async () => {
          expect(button).toBeGreaterThanOrEqual(4.5)
          expect(label).toBeGreaterThanOrEqual(4.5)
        },
      )
    })

    test('broker-login-hint ログインの画面を開いた場合、メールアドレスを入れるとふだん使っているログインの画面が開くという補足が出ること', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(
        page,
        'ブローカーのログインの画面を開くと、メールアドレスの欄の下に「事業所に登録したメールアドレスを入れると、ふだん使っているログインの画面が開きます。」が出る\n前提 ログインせずに予定のカレンダーを開いた',
      )

      await check(
        page,
        'メールアドレスの欄の下に「事業所に登録したメールアドレスを入れると、ふだん使っているログインの画面が開きます。」が出て、「事業所のログインの画面」の語は出ない',
        async () => {
          await expect(brokerPage(page).emailHint).toHaveText(
            '事業所に登録したメールアドレスを入れると、ふだん使っているログインの画面が開きます。',
          )
          await expect(pageBody(page)).not.toContainText('事業所のログインの画面')
        },
      )
    })

    test('broker-login-focus メールアドレスの欄にフォーカスを当てた場合、web の focus-ring と同じフォーカスの表示が出ること', async ({
      page,
    }) => {
      await page.goto('/schedule')
      const email = brokerLogin(page).email
      await expect(email).toBeVisible()
      await intro(
        page,
        'ブローカーのログインの画面でメールアドレスの欄にフォーカスを当てると、packages/ui の focus-ring と同じ 4px の線と 2px の間隔のフォーカスの表示が出る\n前提 ログインせずに予定のカレンダーを開いた',
      )

      await step(page, 'メールアドレスの欄を押す', async () => {
        await email.click()
        await expect(email).toBeFocused()
      })
      const outline = await email.evaluate((element) => {
        const style = getComputedStyle(element)
        return `${style.outlineStyle} ${style.outlineWidth}、間隔 ${style.outlineOffset}`
      })
      await check(page, `メールアドレスの欄に、${outline} のフォーカスの線が出る`, async () => {
        await expect(email).toBeFocused()
        expect(outline).toBe('solid 4px、間隔 2px')
      })
    })

    test('broker-login-failure ログインの途中の値を付けずにブローカーの画面を開いた場合、ログインを続けられない画面が同じカードの形で出ること', async ({
      page,
    }) => {
      await page.goto(`${BROKER_URL}/login`)
      await expect(brokerPage(page).heading).toBeVisible()
      await intro(
        page,
        'login_challenge を付けずにブローカーの画面を開くと、ログインを続けられない画面が同じカードの形で出る\n前提 login_challenge を付けずに、ブローカーのログインの画面を開いた',
      )

      await check(page, '「ログインを続けられませんでした」の画面が出る', () =>
        expect(brokerPage(page).heading).toHaveText('ログインを続けられませんでした'),
      )
    })
  })

  test.describe('ブローカーの画面（ログインなし、スマートフォンの幅）', () => {
    test.use({ viewport: PHONE_VIEWPORT })

    test('broker-login-phone スマートフォンの幅でログインの画面を開いた場合、カードが画面の幅に収まり、横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(brokerLogin(page).email).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅でブローカーのログインの画面を開くと、カードが画面の幅に収まり、横にスクロールしない\n前提 ログインせずに、幅 390px で予定のカレンダーを開いた',
      )

      const width = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      await check(
        page,
        `ブローカーのメールアドレスの入力の画面が出て、横に送れる幅（${width.scroll}px）が画面の幅（${width.client}px）を超えない`,
        async () => {
          await expect(brokerLogin(page).email).toBeVisible()
          expect(width.scroll).toBeLessThanOrEqual(width.client)
        },
      )
    })
  })
})
