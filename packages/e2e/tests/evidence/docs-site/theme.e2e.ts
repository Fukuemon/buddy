import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { docsPage } from '../../selectors/docsSite'
import { pageBody } from '../../selectors/page'

// ドキュメントサイトは `uv run zensical build` の site/ を静的に配る。E2E_BASE_URL にその URL を渡す
const ACTOR = 'ログインなし（ドキュメントサイト）'
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

/** font-family の先頭が name であること。ブラウザは書体の名前を引用符で囲んで返す */
const startsWithFont = (name: string) => new RegExp(`^"?${name}"?(,|$)`)

test.describe('ドキュメントサイト', () => {
  test.describe('背景と書体', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const expected = variant.name === 'before' ? EXPECTED.before : EXPECTED.after

      test(`${prefix}ドキュメントサイトのページを開いた場合、ページの背景が ${expected.canvas} で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'docs-site-canvas',
            title: 'ドキュメントサイトのデザインシステムの使い方のページで、ページの背景の色を見る',
            actor: ACTOR,
            variant,
          },
          openDesignSystem,
          async ({ page, step, check }) => {
            await openDesignSystem(page)
            await step('ドキュメントサイトの「デザインシステム」の「使い方」のページを開いている')
            await expect(pageBody(page)).toHaveCSS('background-color', expected.canvas)
            await check(
              `（撮影のため、録画で見分けにくい色の値を出す）ページの背景は ${expected.canvas}`,
            )
          },
        )
      })

      test(`${prefix}ドキュメントサイトのページを開いた場合、本文が ${expected.text}、コードが ${expected.code} の書体で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'docs-site-font',
            title:
              'ドキュメントサイトのデザインシステムの使い方のページで、本文とコードの書体を見る',
            actor: ACTOR,
            variant,
          },
          openDesignSystem,
          async ({ page, step, check }) => {
            await openDesignSystem(page)
            await step('ドキュメントサイトの「デザインシステム」の「使い方」のページを開いている')
            await expect(docsPage(page).code).toBeVisible()
            await expect(docsPage(page).content).toHaveCSS(
              'font-family',
              startsWithFont(expected.text),
            )
            await expect(docsPage(page).code).toHaveCSS(
              'font-family',
              startsWithFont(expected.code),
            )
            await check(
              `（撮影のため、録画で読み取りにくい書体の名前を出す）本文は ${expected.text}、コードは ${expected.code}`,
            )
          },
        )
      })

      test(`${prefix}ドキュメントサイトの画面仕様書を開いた場合、表とモックが出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'docs-site-layout',
            title:
              'ドキュメントサイトの予定のカレンダーの画面仕様書で、表とモックのレイアウトを見る',
            actor: ACTOR,
            variant,
          },
          openCalendarSpec,
          async ({ page, step, check }) => {
            await openCalendarSpec(page)
            await step(
              'ドキュメントサイトの「画面仕様書」の「予定のカレンダー」のページを開いている',
            )
            await expect(docsPage(page).table).toBeVisible()
            await check('表が出る')

            await step('（撮影のため、モックが見える位置まで送る）')
            const mock = docsPage(page).mock
            await mock.scrollIntoViewIfNeeded()
            await expect(mock).toBeInViewport()
            await check('モックが出る')
          },
        )
      })
    }
  })
})
