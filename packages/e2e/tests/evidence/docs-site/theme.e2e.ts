import { expect, test, type Locator, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { docsPage } from '../../selectors/docsSite'
import { pageBody } from '../../selectors/page'

// 文書のサイトは `uv run zensical build` の site/ を静的に配る。E2E_BASE_URL にその URL を渡す
const ACTOR = 'ログインなし（文書のサイト）'
const DESIGN_SYSTEM = '/design/packages/ui/'
const CALENDAR_SPEC = '/screens/schedule-calendar_予定のカレンダー/'

// 改修前は Zensical のデフォルトの白と Inter、JetBrains Mono。改修後は surface-canvas と Noto Sans JP、Noto Sans Mono
const EXPECTED = {
  before: { canvas: 'rgb(255, 255, 255)', text: 'Inter', code: 'JetBrains Mono' },
  after: { canvas: 'rgb(253, 252, 251)', text: 'Noto Sans JP', code: 'Noto Sans Mono' },
}

const openDesignSystem = async (page: Page) => {
  await page.goto(DESIGN_SYSTEM)
  await expect(docsPage(page).content).toBeVisible()
}

const openCalendarSpec = async (page: Page) => {
  await page.goto(CALENDAR_SPEC)
  await expect(docsPage(page).mock).toBeVisible()
}

/** 先頭の書体の名前。引用符を外す */
const firstFont = (target: Locator) =>
  target.evaluate((el) =>
    getComputedStyle(el)
      .fontFamily.split(',')[0]
      .trim()
      .replace(/^["']|["']$/g, ''),
  )

test.describe('文書のサイト', () => {
  test.describe('背景と書体', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const expected = variant.name === 'before' ? EXPECTED.before : EXPECTED.after

      test(`${prefix}文書のサイトのページを開いた場合、ページの背景が canvas の色で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'docs-site-canvas',
            title: '文書のサイトのデザインシステムの使い方のページで、ページの背景の色を見る',
            actor: ACTOR,
            variant,
          },
          openDesignSystem,
          async ({ page, step, check }) => {
            await openDesignSystem(page)
            await step('文書のサイトの「デザインシステム」の「使い方」のページを開いている')
            await expect(pageBody(page)).toHaveCSS('background-color', expected.canvas)
            await check(
              `（撮影のため、録画で見分けにくい色の値を出す）ページの背景は ${expected.canvas}`,
            )
          },
        )
      })

      test(`${prefix}文書のサイトのページを開いた場合、本文が Noto Sans JP、コードが Noto Sans Mono の書体で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'docs-site-font',
            title: '文書のサイトのデザインシステムの使い方のページで、本文とコードの書体を見る',
            actor: ACTOR,
            variant,
          },
          openDesignSystem,
          async ({ page, step, check }) => {
            await openDesignSystem(page)
            await step('文書のサイトの「デザインシステム」の「使い方」のページを開いている')
            await expect(docsPage(page).code).toBeVisible()
            expect(await firstFont(docsPage(page).content)).toBe(expected.text)
            expect(await firstFont(docsPage(page).code)).toBe(expected.code)
            await check(
              `（撮影のため、録画で読み取りにくい書体の名前を出す）本文は ${expected.text}、コードは ${expected.code}`,
            )
          },
        )
      })

      test(`${prefix}文書のサイトの画面仕様書を開いた場合、モックと表が本文の幅で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'docs-site-layout',
            title: '文書のサイトの予定のカレンダーの画面仕様書で、モックと表のレイアウトを見る',
            actor: ACTOR,
            variant,
          },
          openCalendarSpec,
          async ({ page, step, check }) => {
            await openCalendarSpec(page)
            await step('文書のサイトの「画面仕様書」の「予定のカレンダー」のページを開いている')
            await check('モックが本文の幅で出る')

            await step('（撮影のため、表が見える位置まで送る）')
            const table = docsPage(page).table
            await table.scrollIntoViewIfNeeded()
            await expect(table).toBeVisible()
            await check('表が本文の幅で出る')
          },
        )
      })
    }
  })
})
