import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
const CUTOVER_URL = storyUrl('画面-calendar-calendarimportcontainer--cutover')

test.describe('予定の取り込み', () => {
  test.describe('写せない繰り返しの予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}切り替えの間に規則を写せない繰り返しの予定がある場合、写せない規則の例の文が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-unsupported-recurrence-hint',
            title:
              '予定の正本の切り替えの間のプレビューで、規則を写せない繰り返しの予定に、写せない規則の例の文が出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(CUTOVER_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(CUTOVER_URL)
            const item = page.getByTestId('calendar-import-review-event-biweekly')
            await expect(item).toBeVisible()
            await step(
              '予定の取り込みの画面（Storybook の CalendarImportContainer の Cutover）で、切り替えの間のプレビューを開いている（架空のデータ）',
            )
            await expect(item).toContainText('繰り返しの規則を buddy に写せない')
            await expect(item).toContainText('buddy の繰り返しにできません')
            await item.scrollIntoViewIfNeeded()
            await check(
              '確認が必要な予定に「繰り返しの規則を buddy に写せない」と、写せない規則の例の文が出る',
            )
          },
        )
      })
    }
  })
})
