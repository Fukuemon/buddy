import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'
import { pageBody } from '../../selectors/page'

const URL = storyUrl('画面-schedule-schedulecalendarcontainer--month')
const STORY =
  '前提 予定のカレンダーの月の表示（Storybook の ScheduleCalendarContainer の Month）を開いている'

// 改修後は light-blue-800 と #fdfcfb、改修前は DADS の blue-800 と白
const EXPECTED = { primary: 'rgb(0, 102, 190)', canvas: 'rgb(253, 252, 251)' }
const BEFORE = { primary: 'rgb(0, 49, 216)', canvas: 'rgb(255, 255, 255)' }

/** 色の値が、渡した値のどれかであること */
const oneOf = (...colors: string[]) =>
  new RegExp(`^(${colors.map((color) => color.replace(/[()]/g, '\\$&')).join('|')})$`)

const openCalendar = async (page: Page) => {
  await page.goto(URL)
  await expect(page.getByTestId('schedule-create-open')).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('主の色と画面の背景（ログインなし、Storybook の story）', () => {
    // 色は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は、両方の版の値を受け付ける
    test(
      'design-system-colors 予定のカレンダーを開いた場合、主のボタンが主の色で、画面の背景が canvas の色で出ること',
      { tag: '@compare' },
      async ({ page }) => {
        await openCalendar(page)
        await intro(page, `予定のカレンダーで、主のボタンの面と画面の背景の色を見る\n${STORY}`)

        await check(
          page,
          `（撮影のため、録画で見分けにくい色の値を出す）「予定を作成」の面は ${EXPECTED.primary}、画面の背景は ${EXPECTED.canvas}`,
          async () => {
            await expect(page.getByTestId('schedule-create-open')).toHaveCSS(
              'background-color',
              oneOf(EXPECTED.primary, BEFORE.primary),
            )
            await expect(pageBody(page)).toHaveCSS(
              'background-color',
              oneOf(EXPECTED.canvas, BEFORE.canvas),
            )
          },
        )
      },
    )

    test('design-system-focus 主のボタンにキーボードでフォーカスした場合、黒の枠と黄色の輪のフォーカスの表示が出ること', async ({
      page,
    }) => {
      await openCalendar(page)
      await intro(
        page,
        `予定のカレンダーで、主のボタンにキーボードでフォーカスし、フォーカスの表示を見る\n${STORY}`,
      )
      const create = page.getByTestId('schedule-create-open')

      await step(
        page,
        '「予定を作成」の 1 つ前に戻り、Tab キーで「予定を作成」に移る',
        async () => {
          // focus() だけでは :focus-visible にならないので、キーボードで移り直す
          await create.focus()
          await page.keyboard.press('Shift+Tab')
          await page.keyboard.press('Tab')
        },
      )
      await check(
        page,
        '「予定を作成」の周りに、黒の枠と黄色の輪のフォーカスの表示が出る',
        async () => {
          await expect(create).toBeFocused()
          await expect(create).toHaveCSS('outline-color', 'rgb(0, 0, 0)')
        },
      )
    })
  })
})
