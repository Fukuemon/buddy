import { expect, test, type Page } from '@playwright/test'

import { LOGIN_STAFF } from '../../fixtures/env'
import { acceptBrowserDialog } from '../../widgets/browserDialog/actions/browserDialog'

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。Asia/Tokyo の今日から数える。 */
const fromNextMonday = (days: number) => {
  const now = Date.now() + 9 * 60 * 60 * 1000
  const today = new Date(now).getUTCDay()
  const offset = ((8 - today) % 7 || 7) + days
  return new Date(now + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** 日の表示のログインした職員の列の、title の予定。 */
const ownEvent = (page: Page, title: string) =>
  page
    .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })

const openDay = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

/** date の日の表示から予定の作成を開き、通常の予定のタイトルと予定者（ログインした職員）を入れて、繰り返しの入力を開く。 */
const openRecurringNormal = async (page: Page, date: string, title: string) => {
  await openDay(page, date)
  await page.getByTestId('schedule-create-open').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
  await page.getByTestId('schedule-kind-tab-normal').check()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(title)
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
  await page.getByTestId('schedule-field-recurrence').click()
  await page.getByTestId('schedule-form-repeats').check()
}

test.describe('予定のカレンダー', () => {
  test.describe('予定の作成', () => {
    test.describe('繰り返しの予定', () => {
      test('毎週の月曜と木曜と終了日で作った場合、終了日までの月曜と木曜に回が出て、終了日の後の月曜には出ないこと', async ({
        page,
      }) => {
        const title = `E2E の週 2 回の定例 ${Date.now()}`
        const start = fromNextMonday(0)
        const endDate = fromNextMonday(10)
        await openRecurringNormal(page, start, title)
        await page.getByTestId('recurring-rule-preset').selectOption('custom')
        await page.getByTestId('recurring-rule-day-of-week-4').check()
        await page.getByTestId('recurring-rule-ends-on').check()
        await page.getByTestId('recurring-rule-end-date').fill(endDate)
        await expect(page.getByTestId('schedule-field-recurrence')).toContainText(
          '毎週 月曜日、木曜日',
        )
        await page.getByTestId('schedule-create-submit').click()

        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
        await expect(page).toHaveURL(new RegExp(`/schedule\\?.*date=${start}`))
        await expect(ownEvent(page, title)).toBeVisible()
        for (const days of [3, 7, 10]) {
          await openDay(page, fromNextMonday(days))
          await expect(ownEvent(page, title)).toBeVisible()
        }
        await openDay(page, fromNextMonday(14))
        await expect(ownEvent(page, title)).toHaveCount(0)
      })

      test('日付が繰り返しの回に当たらない規則で作成を押した場合、理由が出て、予定を作らないこと', async ({
        page,
      }) => {
        const title = `E2E の当たらない定例 ${Date.now()}`
        const start = fromNextMonday(0)
        await openRecurringNormal(page, start, title)
        await page.getByTestId('recurring-rule-preset').selectOption('custom')
        await page.getByTestId('recurring-rule-day-of-week-2').check()
        await page.getByTestId('recurring-rule-day-of-week-1').uncheck()
        await page.getByTestId('schedule-create-submit').click()

        await expect(page.getByTestId('schedule-field-recurrence')).toContainText(
          '日付が繰り返しの回に当たりません。日付か繰り返しを変えてください',
        )
        await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
        // 送っていれば、次の火曜に回ができる。閉じて開き直した日の表示で、列が出てから数える
        const confirm = await acceptBrowserDialog(page, () =>
          page.getByTestId('schedule-new-cancel').click(),
        )
        expect(confirm).toBe('変更が破棄されますがよろしいですか？')
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
        await openDay(page, fromNextMonday(1))
        await expect(ownEvent(page, title)).toHaveCount(0)
      })
    })
  })
})
