import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

test.describe('デザインシステム', () => {
  test.describe('主の色と画面の地', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}予定のカレンダーを開いた場合、主の色が light-blue で、画面の地が温かい白で、フォーカスの表示が変わらないこと`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-schedule-schedulecalendarcontainer--month')
        await recordPrEvidence(
          browser,
          {
            name: 'design-system-colors',
            title:
              '予定のカレンダーで、主の色、今日の面、画面の地、主のボタンのフォーカスの表示を見る',
            actor: 'ログインなし（Storybook の story）',
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.goto(url)
            const create = page.getByTestId('schedule-create-open')
            await expect(create).toBeVisible()
            await step(
              '予定のカレンダーの月の表示（Storybook の ScheduleCalendarContainer の Month）を開いている',
            )

            const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
            await check(
              `「予定を作成」の面の色は ${await create.evaluate((element) => getComputedStyle(element).backgroundColor)}、画面の地は ${body}`,
            )

            await step('Tab キーで「予定を作成」にフォーカスを移す')
            // focus() では :focus-visible にならないので、キーボードで移る
            for (let count = 0; count < 20; count += 1) {
              if (await create.evaluate((element) => element === document.activeElement)) break
              await page.keyboard.press('Tab')
            }
            await expect(create).toBeFocused()
            await check('「予定を作成」の周りに、黒の枠と黄色の輪のフォーカスの表示が出る')
          },
        )
      })
    }
  })
})
