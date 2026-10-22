import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, mockUrl, recordPrEvidence } from '../../fixtures/evidence'

const CALENDAR_MONTH = 'schedule-calendar_予定のカレンダー/mocks/01-month.html'
const NEW_NORMAL = 'schedule-new_予定の作成/mocks/02-normal.html'

test.describe('画面仕様書のモック', () => {
  test.describe('モックの画面の中の操作', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}予定のカレンダーのモックで表示を切り替えて予定を押した場合、予定の詳細と編集のモックへ移ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'mock-calendar-to-edit',
            title:
              '予定のカレンダーのモックで、週と日の表示へ移り、予定を押すと予定の詳細、編集のモックへ移る',
            actor: 'ログインなし',
            variant,
          },
          async (page) => {
            await page.goto(mockUrl(CALENDAR_MONTH))
          },
          async ({ page, step, check }) => {
            await page.goto(mockUrl(CALENDAR_MONTH))
            await expect(page.getByTestId('calendar-view-week')).toBeVisible()
            await step('予定のカレンダーの月の表示のモック（01-month.html）を開いている')

            await step('「週」を押す')
            await page.getByTestId('calendar-view-week').click()
            await expect(page).toHaveURL(/02-week\.html/)
            await check('週の表示のモック（02-week.html）へ移る')

            await step('「日」を押す')
            await page.getByTestId('calendar-view-day').click()
            await expect(page).toHaveURL(/03-day\.html/)
            await check('日の表示のモック（03-day.html）へ移る')

            await step('訪問の予定を押す')
            await page.getByTestId('schedule-event-{予定の id}').first().click()
            await expect(page).toHaveURL(/schedule-detail_.+\/01-visit\.html/)
            await check('予定の詳細のモック（01-visit.html）へ移る')

            await step('「編集」を押す')
            await page.getByTestId('schedule-detail-edit').click()
            await expect(page).toHaveURL(/schedule-edit_.+\/03-initial\.html/)
            await check('予定の編集のモック（03-initial.html）へ移る')
          },
        )
      })

      test(`${prefix}予定の作成のモックで種類を切り替えて作成を押した場合、入力の誤りのモックへ移り、Escape でカレンダーに戻ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'mock-create-form',
            title:
              '予定の作成のモックで、訪問に切り替えて作成を押すと入力の誤りのモックへ移り、Escape でカレンダーのモックへ戻る',
            actor: 'ログインなし',
            variant,
          },
          async (page) => {
            await page.goto(mockUrl(NEW_NORMAL))
          },
          async ({ page, step, check }) => {
            await page.goto(mockUrl(NEW_NORMAL))
            await expect(page.getByTestId('schedule-kind-tab-visit')).toBeVisible()
            await step('予定の作成の通常の予定のモック（02-normal.html）を開いている')

            await step('予定の種類の「訪問」を押す')
            await page.getByTestId('schedule-kind-tab-visit').click()
            await expect(page).toHaveURL(/schedule-new_.+\/01-visit\.html/)
            await check('訪問の予定のモック（01-visit.html）へ移る')

            await step('何も入れずに「作成」を押す')
            await page.getByTestId('schedule-create-submit').click()
            await expect(page).toHaveURL(/09-invalid\.html/)
            await check('入力の誤りのモック（09-invalid.html）へ移る')

            await step('Escape キーを押す')
            await page.keyboard.press('Escape')
            await expect(page).toHaveURL(/schedule-calendar_.+\/01-month\.html/)
            await check('予定のカレンダーの月の表示のモック（01-month.html）へ戻る')
          },
        )
      })
    }
  })
})
