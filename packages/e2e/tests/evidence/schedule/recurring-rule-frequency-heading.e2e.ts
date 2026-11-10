import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const WEEKLY_URL = storyUrl('画面-schedule-recurringrulefields--weekly')

/** 字幕の帯に隠れないように、story の中身を下へずらす。撮影のための操作である。 */
const shiftStory = (page: Page) =>
  page.addStyleTag({ content: '#storybook-root { padding-top: 72px; }' })

// 見出しの文言は、改修前と改修後の判定のスクリーンショットを並べて比べる。
// 確認する関数は、改修前の見出し「繰り返す」も受け付ける
test.describe('繰り返しの変更', () => {
  test.describe('規則の欄の頻度の見出し（ログインなし、Storybook の story）', () => {
    test(
      'recurring-rule-frequency-heading 「カスタム…」を選んだ場合、繰り返しの下の欄の見出しが「頻度」になり、毎週か毎月を選べること',
      { tag: '@compare' },
      async ({ page }) => {
        await page.goto(WEEKLY_URL)
        await shiftStory(page)
        await expect(page.getByTestId('recurring-rule-preset')).toBeVisible()
        await intro(
          page,
          '繰り返しで「カスタム…」を選ぶと、改修後は繰り返しの下の欄の見出しが「繰り返す」から「頻度」になり、毎週か毎月を選べる\n前提 繰り返しの欄（Storybook の RecurringRuleFields の Weekly）で、毎週火曜の規則を開いている（架空のデータ）',
        )

        await step(page, '繰り返しで「カスタム…」を選ぶ', async () => {
          await page.getByTestId('recurring-rule-preset').selectOption('custom')
        })
        const frequency = page.getByTestId('recurring-rule-frequency')
        await check(page, '繰り返しの下の欄の見出しが「頻度」', () =>
          expect(frequency).toHaveAccessibleName(/^(頻度|繰り返す)$/),
        )
        await step(page, 'その欄で「毎月」を選ぶ', async () => {
          await frequency.selectOption('monthly')
        })
        await check(page, '毎月を選ぶと、日の欄が出る', () =>
          expect(page.getByTestId('recurring-rule-monthly-by-day')).toBeVisible(),
        )
      },
    )
  })
})
