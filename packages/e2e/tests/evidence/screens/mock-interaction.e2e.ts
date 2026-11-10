import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { mockUrl } from '../../fixtures/evidence'

const CALENDAR_MONTH = 'schedule-calendar_予定のカレンダー/mocks/01-month.html'
const NEW_NORMAL = 'schedule-new_予定の作成/mocks/02-normal.html'

test.describe('画面仕様書のモック', () => {
  test.describe('モックの画面の中の操作（ログインなし、画面仕様書のモック）', () => {
    test('mock-calendar-to-edit 予定のカレンダーのモックで表示を切り替えて予定を押した場合、予定の詳細と編集のモックへ移ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(CALENDAR_MONTH))
      await expect(page.getByTestId('calendar-view-week')).toBeVisible()
      await intro(
        page,
        '予定のカレンダーのモックで、週と日の表示へ移り、予定を押すと予定の詳細、編集のモックへ移る\n前提 予定のカレンダーの月の表示のモック（01-month.html）を開いている',
      )

      await step(page, '「週」を押す', () => page.getByTestId('calendar-view-week').click())
      await check(page, '週の表示のモック（02-week.html）へ移る', () =>
        expect(page).toHaveURL(/02-week\.html/),
      )

      await step(page, '「日」を押す', () => page.getByTestId('calendar-view-day').click())
      await check(page, '日の表示のモック（03-day.html）へ移る', () =>
        expect(page).toHaveURL(/03-day\.html/),
      )

      await step(page, '訪問の予定を押す', () =>
        page.getByTestId('schedule-event-{予定の id}').first().click(),
      )
      await check(page, '予定の詳細のモック（01-visit.html）へ移る', () =>
        expect(page).toHaveURL(/schedule-detail_.+\/01-visit\.html/),
      )

      await step(page, '「編集」を押す', () => page.getByTestId('schedule-detail-edit').click())
      await check(page, '予定の編集のモック（03-initial.html）へ移る', () =>
        expect(page).toHaveURL(/schedule-edit_.+\/03-initial\.html/),
      )
    })

    test('mock-create-form 予定の作成のモックで種類を切り替えて作成を押した場合、入力の誤りのモックへ移り、Escape でカレンダーに戻ること', async ({
      page,
    }) => {
      await page.goto(mockUrl(NEW_NORMAL))
      await expect(page.getByTestId('schedule-kind-tab-visit')).toBeVisible()
      await intro(
        page,
        '予定の作成のモックで、訪問に切り替えて作成を押すと入力の誤りのモックへ移り、Escape でカレンダーのモックへ戻る\n前提 予定の作成の通常の予定のモック（02-normal.html）を開いている',
      )

      await step(page, '予定の種類の「訪問」を押す', () =>
        page.getByTestId('schedule-kind-tab-visit').click(),
      )
      await check(page, '訪問の予定のモック（01-visit.html）へ移る', () =>
        expect(page).toHaveURL(/schedule-new_.+\/01-visit\.html/),
      )

      await step(page, '何も入れずに「作成」を押す', () =>
        page.getByTestId('schedule-create-submit').click(),
      )
      await check(page, '入力の誤りのモック（09-invalid.html）へ移る', () =>
        expect(page).toHaveURL(/09-invalid\.html/),
      )

      await step(page, 'Escape キーを押す', () => page.keyboard.press('Escape'))
      await check(page, '予定のカレンダーの月の表示のモック（01-month.html）へ戻る', () =>
        expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/),
      )
    })
  })
})
