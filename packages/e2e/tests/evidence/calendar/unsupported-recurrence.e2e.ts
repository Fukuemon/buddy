import { expect, test } from '@playwright/test'

import { check, intro } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const CUTOVER_URL = storyUrl('画面-calendar-calendarimportcontainer--cutover')

test.describe('予定の取り込み', () => {
  test.describe('写せない繰り返しの予定（ログインなし、Storybook の story）', () => {
    test('calendar-unsupported-recurrence-hint 移行の間に規則を写せない繰り返しの予定がある場合、写せない規則の例の文が出ること', async ({
      page,
    }) => {
      await page.goto(CUTOVER_URL)
      const item = page.getByTestId('calendar-import-review-event-biweekly')
      await expect(item).toBeVisible()
      await intro(
        page,
        '予定の管理の移行の間のプレビューで、規則を写せない繰り返しの予定に、写せない規則の例の文が出る\n前提 予定の取り込みの画面（Storybook の CalendarImportContainer の Cutover）で、移行の間のプレビューを開いている（架空のデータ）',
      )

      await check(
        page,
        '確認が必要な予定に「繰り返しの規則を buddy に写せない」と、写せない規則の例の文が出る',
        async () => {
          await expect(item).toContainText('繰り返しの規則を buddy に写せない')
          await expect(item).toContainText('buddy の繰り返しにできません')
          await item.scrollIntoViewIfNeeded()
        },
      )
    })
  })
})
