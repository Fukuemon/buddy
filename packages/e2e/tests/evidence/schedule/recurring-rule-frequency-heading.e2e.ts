import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const WEEKLY_URL = storyUrl('画面-schedule-recurringrulefields--weekly')

/** 字幕の帯に隠れないように、story の中身を下へずらす。撮影のための操作である。 */
const shiftStory = (page: Page) =>
  page.addStyleTag({ content: '#storybook-root { padding-top: 72px; }' })

test.describe('繰り返しの変更', () => {
  test.describe('規則の欄の頻度の見出し', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const heading = variant.name === 'before' ? '繰り返す' : '頻度'

      test(`${prefix}「カスタム…」を選んだ場合、繰り返しの下の欄の見出しが「頻度」になり、毎週か毎月を選べること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-frequency-heading',
            title:
              '繰り返しで「カスタム…」を選ぶと、改修後は繰り返しの下の欄の見出しが「繰り返す」から「頻度」になり、毎週か毎月を選べる',
            actor: 'ログインなし（Storybook の story）',
            variant,
          },
          async (page) => {
            await page.goto(WEEKLY_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(WEEKLY_URL)
            await shiftStory(page)
            await expect(page.getByTestId('recurring-rule-preset')).toBeVisible()
            await step(
              '繰り返しの欄（Storybook の RecurringRuleFields の Weekly）で、毎週火曜の規則を開いている（架空のデータ）',
            )
            await step('繰り返しで「カスタム…」を選ぶ')
            await page.getByTestId('recurring-rule-preset').selectOption('custom')
            const frequency = page.getByTestId('recurring-rule-frequency')
            await expect(frequency).toHaveAccessibleName(heading)
            await check(`繰り返しの下の欄の見出しが「${heading}」`)
            await step('その欄で「毎月」を選ぶ')
            await frequency.selectOption('monthly')
            await expect(page.getByTestId('recurring-rule-monthly-by-day')).toBeVisible()
            await check('毎月を選ぶと、日の欄が出る')
          },
        )
      })
    }
  })
})
