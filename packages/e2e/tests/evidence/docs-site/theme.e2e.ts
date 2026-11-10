import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { docsPage } from '../../selectors/docsSite'
import { pageBody } from '../../selectors/page'

// ドキュメントサイトは `uv run zensical build` の site/ を静的に配る。E2E_BASE_URL にその URL を渡す
const DESIGN_SYSTEM = '/design/packages/ui/'
const CALENDAR_SPEC = '/screens/schedule-calendar_予定のカレンダー/'

// 改修後は surface-canvas と Noto Sans JP、Noto Sans Mono。改修前は Zensical のデフォルトの白と Inter、JetBrains Mono
const EXPECTED = { canvas: 'rgb(253, 252, 251)', text: 'Noto Sans JP', code: 'Noto Sans Mono' }
const BEFORE = { canvas: 'rgb(255, 255, 255)', text: 'Inter', code: 'JetBrains Mono' }

/** font-family の先頭が names のどれかであること。ブラウザは書体の名前を引用符で囲んで返す */
const startsWithFont = (...names: string[]) => new RegExp(`^"?(${names.join('|')})"?(,|$)`)

/** background-color が、渡した版のどれかの背景の色であること */
const canvasOf = (...versions: { canvas: string }[]) =>
  new RegExp(`^(${versions.map(({ canvas }) => canvas.replace(/[()]/g, '\\$&')).join('|')})$`)

const openDesignSystem = async (page: Page) => {
  await page.goto(DESIGN_SYSTEM)
  await expect(docsPage(page).content).toBeVisible()
}

// 背景と書体は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は、両方の版の値を受け付ける
test.describe('ドキュメントサイト', () => {
  test.describe('背景と書体（ログインなし）', () => {
    test(
      `docs-site-canvas ドキュメントサイトのページを開いた場合、ページの背景が ${EXPECTED.canvas} で出ること`,
      { tag: '@compare' },
      async ({ page }) => {
        await openDesignSystem(page)
        await intro(
          page,
          'ドキュメントサイトのデザインシステムの使い方のページで、ページの背景の色を見る\n前提 ドキュメントサイトの「デザインシステム」の「使い方」のページを開いている',
        )

        await check(
          page,
          `（撮影のため、録画で見分けにくい色の値を出す）ページの背景は ${EXPECTED.canvas}`,
          () => expect(pageBody(page)).toHaveCSS('background-color', canvasOf(EXPECTED, BEFORE)),
        )
      },
    )

    test(
      `docs-site-font ドキュメントサイトのページを開いた場合、本文が ${EXPECTED.text}、コードが ${EXPECTED.code} の書体で出ること`,
      { tag: '@compare' },
      async ({ page }) => {
        await openDesignSystem(page)
        await expect(docsPage(page).code).toBeVisible()
        await intro(
          page,
          'ドキュメントサイトのデザインシステムの使い方のページで、本文とコードの書体を見る\n前提 ドキュメントサイトの「デザインシステム」の「使い方」のページを開いている',
        )

        await check(
          page,
          `（撮影のため、録画で読み取りにくい書体の名前を出す）本文は ${EXPECTED.text}、コードは ${EXPECTED.code}`,
          async () => {
            await expect(docsPage(page).content).toHaveCSS(
              'font-family',
              startsWithFont(EXPECTED.text, BEFORE.text),
            )
            await expect(docsPage(page).code).toHaveCSS(
              'font-family',
              startsWithFont(EXPECTED.code, BEFORE.code),
            )
          },
        )
      },
    )

    test('docs-site-layout ドキュメントサイトの画面仕様書を開いた場合、表とモックが出ること', async ({
      page,
    }) => {
      await page.goto(CALENDAR_SPEC)
      await expect(docsPage(page).mock).toBeVisible()
      await intro(
        page,
        'ドキュメントサイトの予定のカレンダーの画面仕様書で、表とモックのレイアウトを見る\n前提 ドキュメントサイトの「画面仕様書」の「予定のカレンダー」のページを開いている',
      )

      await check(page, '表が出る', () => expect(docsPage(page).table).toBeVisible())

      const mock = docsPage(page).mock
      await step(page, '（撮影のため、モックが見える位置まで送る）', () =>
        mock.scrollIntoViewIfNeeded(),
      )
      await check(page, 'モックが出る', () => expect(mock).toBeInViewport())
    })
  })
})
