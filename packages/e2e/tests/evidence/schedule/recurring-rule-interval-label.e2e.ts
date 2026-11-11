import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const BIWEEKLY_DAYS_URL = storyUrl('画面-schedule-recurringrulefields--biweekly-days')
const EVERY_THREE_WEEKS_URL = storyUrl('画面-schedule-recurringrulefields--every-three-weeks')

/** 字幕の帯に隠れないように、story の中身を下へずらす。撮影のための操作である。 */
const shiftStory = (page: Page) =>
  page.addStyleTag({ content: '#storybook-root { padding-top: 72px; }' })

// 選択肢の文言は、判定のスクリーンショットで読む。確認する関数は、繰り返しの欄が出て、選んだ値になったことだけを見る
test.describe('繰り返しの変更', () => {
  test.describe('間隔と複数の曜日の規則の選択肢（ログインなし、Storybook の story）', () => {
    test('recurring-rule-biweekly-days-label 隔週の月曜と木曜の規則を開いた場合、選択肢の文言が送る規則と同じになること', async ({
      page,
    }) => {
      await page.goto(BIWEEKLY_DAYS_URL)
      await shiftStory(page)
      const preset = page.getByTestId('recurring-rule-preset')
      await expect(preset).toBeVisible()
      await intro(
        page,
        '隔週の月曜と木曜の規則を木曜の回から開くと、選択肢に今の規則と隔週の木曜が出る\n前提 繰り返しの欄（Storybook の RecurringRuleFields の BiweeklyDays）で、隔週の月曜と木曜の規則を 2026-10-22（木曜）の回から開いている（架空のデータ）',
      )

      await check(page, '開いたときの繰り返しの選択肢と、選んでいる繰り返し', () =>
        expect(preset).toBeVisible(),
      )
      await step(page, '繰り返しで、開いた回の曜日の選択肢（木曜日）を選ぶ', async () => {
        await preset.selectOption('weekly')
      })
      await check(page, '開いた回の曜日の選択肢（木曜日）を選んだときの文言', () =>
        expect(preset).toHaveValue('weekly'),
      )
    })

    test('recurring-rule-every-three-weeks-label 3 週ごとの火曜の規則を開いた場合、選択肢に間隔が出ること', async ({
      page,
    }) => {
      await page.goto(EVERY_THREE_WEEKS_URL)
      await shiftStory(page)
      const preset = page.getByTestId('recurring-rule-preset')
      await expect(preset).toBeVisible()
      await intro(
        page,
        '3 週ごとの火曜の規則を開くと、選択肢に「3 週ごと 火曜日」が出る\n前提 繰り返しの欄（Storybook の RecurringRuleFields の EveryThreeWeeks）で、3 週ごとの火曜の規則を 2026-10-20（火曜）の回から開いている（架空のデータ）',
      )

      await check(page, '開いたときの、選んでいる繰り返しの選択肢の文言', () =>
        expect(preset).toBeVisible(),
      )
    })
  })
})
