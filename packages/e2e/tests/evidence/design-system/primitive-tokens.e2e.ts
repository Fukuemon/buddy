import { expect, test, type Page } from '@playwright/test'

import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  STORYBOOK_URL,
  recordPrEvidence,
  storyUrl,
} from '../../fixtures/evidence'
import { pageBody, pageHeading } from '../../selectors/page'

const ACTOR = 'ログインなし（Storybook の story）'
const COLOR_DOCS_URL = `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent('トークン-色--docs')}&viewMode=docs`
const CALENDAR_URL = storyUrl('画面-schedule-schedulecalendarcontainer--month')

/**
 * :root のセマンティックトークンとテーマ変数を、ブラウザが解決した値で並べ、SHA-256 の先頭 12 文字にする。
 * 改修前と改修後で同じ文字列なら、トークンの名前ごとの値が同じである。
 */
const tokenDigest = (page: Page): Promise<{ count: number; digest: string }> =>
  page.evaluate(async () => {
    const style = getComputedStyle(document.documentElement)
    const names = new Set<string>()
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      const walk = (list: CSSRuleList) => {
        for (const rule of Array.from(list)) {
          if (rule instanceof CSSStyleRule) {
            for (const name of Array.from(rule.style)) {
              if (/^--(buddy-color-|color-|text-|radius-|shadow-|font-sans)/.test(name))
                names.add(name)
            }
          }
          if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules)
        }
      }
      walk(rules)
    }
    // プリミティブトークンは改修の前後で名前が違うので外す。整形の違いを比べないよう、空白を詰める
    const entries = [...names]
      .filter((n) => !/^--color-(primitive|neutral|key|semantic)-/.test(n))
      .filter((n) => style.getPropertyValue(n).trim() !== '')
      .sort()
      .map((n) => `${n}:${style.getPropertyValue(n).replace(/\s+/g, '')}`)
    const bytes = new TextEncoder().encode(entries.join(';'))
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
    return { count: entries.length, digest: hex.slice(0, 12) }
  })

const openColorDocs = async (page: Page) => {
  await page.goto(COLOR_DOCS_URL)
  await expect(pageHeading(page, '色')).toBeVisible()
}

const openCalendar = async (page: Page) => {
  await page.goto(CALENDAR_URL)
  await expect(page.getByTestId('schedule-create-open')).toBeVisible()
}

test.describe('デザインシステムのトークン', () => {
  test.describe('プリミティブトークンを buddy に持つ前と後', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}カタログの色のページを開いた場合、トークンの値と見た目が改修の前後で同じであること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'primitive-tokens-color-docs',
            title: 'カタログの色のページで、トークンの値と見た目を見る',
            actor: ACTOR,
            variant,
          },
          openColorDocs,
          async ({ page, step, check }) => {
            await openColorDocs(page)
            await step('カタログの「トークン/色」のページを開いている')
            await page.mouse.wheel(0, 900)
            await step('面と線、状態の色、区別の色の見本を下へ送って見る')
            await page.mouse.wheel(0, 900)
            const { count, digest } = await tokenDigest(page)
            await page.mouse.wheel(0, -1800)
            await check(
              `（撮影のため、録画で見分けにくい値を出す）トークン ${count} 個の解決した値の SHA-256 の先頭は ${digest}。改修の前後で同じ`,
            )
          },
        )
      })

      for (const [label, name, viewport] of [
        ['幅 768px 以上', 'primitive-tokens-calendar-desktop', undefined],
        ['幅 768px 未満', 'primitive-tokens-calendar-phone', PHONE_VIEWPORT],
      ] as const) {
        test(`${prefix}予定のカレンダーを${label}で開いた場合、色、文字、角丸、影が改修の前後で同じであること`, async ({
          browser,
        }) => {
          await recordPrEvidence(
            browser,
            {
              name,
              title: `予定のカレンダーを${label}で開き、色、文字、角丸、影を見る`,
              actor: ACTOR,
              variant,
              viewport,
            },
            openCalendar,
            async ({ page, step, check }) => {
              await openCalendar(page)
              await step(
                `予定のカレンダーの月の表示（Storybook の ScheduleCalendarContainer の Month）を${label}で開いている`,
              )
              const create = page.getByTestId('schedule-create-open')
              await expect(create).toHaveCSS('background-color', 'rgb(0, 102, 190)')
              await expect(create).toHaveCSS('border-top-left-radius', '8px')
              await expect(pageBody(page)).toHaveCSS('background-color', 'rgb(253, 252, 251)')
              await expect(pageBody(page)).toHaveCSS('font-family', /Noto Sans JP/)
              const { count, digest } = await tokenDigest(page)
              await check(
                `（撮影のため、録画で見分けにくい値を出す）「予定を作成」の面は rgb(0, 102, 190)、角丸は 8px。トークン ${count} 個の解決した値の SHA-256 の先頭は ${digest}`,
              )
            },
          )
        })
      }
    }
  })
})
