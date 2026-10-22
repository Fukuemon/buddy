import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { pageBody } from '../../selectors/page'

const ACTOR = 'ログインなし（Storybook の story）'
const URL = storyUrl('画面-schedule-schedulecalendarcontainer--month')

// 改修前は DADS の blue-800 と白、改修後は light-blue-800 と #fdfcfb
const EXPECTED = {
  before: { primary: 'rgb(0, 49, 216)', canvas: 'rgb(255, 255, 255)' },
  after: { primary: 'rgb(0, 102, 190)', canvas: 'rgb(253, 252, 251)' },
}

const openCalendar = async (page: Page) => {
  await page.goto(URL)
  await expect(page.getByTestId('schedule-create-open')).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('主の色と画面の地', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const expected = variant.name === 'before' ? EXPECTED.before : EXPECTED.after

      test(`${prefix}予定のカレンダーを開いた場合、主のボタンが主の色で、画面の地が canvas の色で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'design-system-colors',
            title: '予定のカレンダーで、主のボタンの面と画面の地の色を見る',
            actor: ACTOR,
            variant,
          },
          openCalendar,
          async ({ page, step, check }) => {
            await openCalendar(page)
            await step(
              '予定のカレンダーの月の表示（Storybook の ScheduleCalendarContainer の Month）を開いている',
            )
            const create = page.getByTestId('schedule-create-open')
            await expect(create).toHaveCSS('background-color', expected.primary)
            await expect(pageBody(page)).toHaveCSS('background-color', expected.canvas)
            await check(
              `（撮影のため、録画で見分けにくい色の値を出す）「予定を作成」の面は ${expected.primary}、画面の地は ${expected.canvas}`,
            )
          },
        )
      })

      test(`${prefix}主のボタンにキーボードでフォーカスした場合、黒の枠と黄色の輪のフォーカスの表示が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'design-system-focus',
            title:
              '予定のカレンダーで、主のボタンにキーボードでフォーカスし、フォーカスの表示を見る',
            actor: ACTOR,
            variant,
          },
          openCalendar,
          async ({ page, step, check }) => {
            await openCalendar(page)
            await step(
              '予定のカレンダーの月の表示（Storybook の ScheduleCalendarContainer の Month）を開いている',
            )
            const create = page.getByTestId('schedule-create-open')

            await step('「予定を作成」の 1 つ前に戻り、Tab キーで「予定を作成」に移る')
            // focus() だけでは :focus-visible にならないので、キーボードで移り直す
            await create.focus()
            await page.keyboard.press('Shift+Tab')
            await page.keyboard.press('Tab')
            await expect(create).toBeFocused()
            await expect(create).toHaveCSS('outline-color', 'rgb(0, 0, 0)')
            await check('「予定を作成」の周りに、黒の枠と黄色の輪のフォーカスの表示が出る')
          },
        )
      })
    }
  })
})
