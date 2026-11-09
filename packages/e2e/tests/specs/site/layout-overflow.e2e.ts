import { expect, test, type Page } from '@playwright/test'

import { pageRoot } from '../../selectors/page'

/**
 * 描画した画面の横方向のオーバーフローを、DESIGN.md の原則 LAYOUT-OVERFLOW で確認する。
 * 幅は、スマートフォンの幅（390px）と、ブレークポイントの `desktop:`（768px）の前後と、パソコンの幅（1280px）にする。
 * ページの全体の幅だけを見る。内側の領域で切れた文字とボタンは、撮った画像をレビューで見る。
 */
const WIDTHS = [390, 767, 768, 1280] as const

const SCREENS = [
  {
    name: '予定のカレンダー',
    // 表示の単位を省くと幅 768px 未満では日の表示から始まるので、どの幅でも月の表示を開く
    path: '/schedule?view=month',
    ready: (page: Page) => page.getByTestId('schedule-calendar'),
  },
  {
    name: '利用者の一覧',
    path: '/patients',
    ready: (page: Page) => page.getByTestId('patient-list-table'),
  },
  {
    name: '職員の一覧',
    path: '/staff',
    ready: (page: Page) => page.getByTestId('staff-list-table'),
  },
  {
    name: '部署とチーム',
    path: '/organization',
    ready: (page: Page) => page.getByTestId('organization-list-department-table'),
  },
  {
    name: '照合',
    path: '/receipt',
    ready: (page: Page) => page.getByTestId('receipt-check-submit'),
  },
] as const

test.describe('画面の枠', () => {
  test.describe('横方向のオーバーフロー', () => {
    for (const screen of SCREENS) {
      test(`${screen.name}を幅 ${WIDTHS.join('、')}px で開いた場合、ページが横にはみ出さないこと`, async ({
        page,
      }, testInfo) => {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(screen.path)
          await expect(screen.ready(page)).toBeVisible()
          await page.evaluate(() => document.fonts.ready)

          const overflow = await pageRoot(page).evaluate(
            (root) => root.scrollWidth - root.clientWidth,
          )
          // はみ出した幅もレビューに画像が要るので、soft で失敗を記録して、残りの幅も撮る
          expect
            .soft(
              overflow,
              `LAYOUT-OVERFLOW: ${screen.name}は幅 ${width}px で ${overflow}px はみ出す`,
            )
            .toBeLessThanOrEqual(0)
          await page.screenshot({
            path: testInfo.outputPath(`${screen.path.split('?')[0]?.slice(1)}-${width}.png`),
            fullPage: true,
            animations: 'disabled',
          })
        }
      })
    }
  })
})
