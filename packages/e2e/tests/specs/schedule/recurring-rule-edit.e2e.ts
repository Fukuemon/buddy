import { expect, test, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { createWeeklyNormalSchedule, replaceOccurrence } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** YYYY-MM-DD の曜日。1 が月曜、7 が日曜。 */
const isoWeekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
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

/** 予定の詳細の「編集」のメニューから「繰り返しを変更」を選ぶ。 */
const openRecurrenceChange = async (page: Page) => {
  await page.getByTestId('schedule-detail-edit').click()
  await page.getByTestId('schedule-detail-edit-recurrence').click()
  await expect(page.getByTestId('schedule-recurrence-modal')).toBeVisible()
}

test.describe('予定の編集', () => {
  test.describe('繰り返しの予定の規則の変更', () => {
    test('毎週月曜の繰り返しの予定の回で「繰り返しを変更」から毎週火曜にした場合、その日以降は火曜に出て、その日より前の月曜の回は残ること', async ({
      page,
      request,
    }) => {
      const title = `E2E の定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const effective = fromNextMonday(7)
      const tuesday = fromNextMonday(8)
      const token = await issueAccessToken(request, LOGIN_EMAIL)
      const created = await createWeeklyNormalSchedule(request, token, STAFF_FORM.facilityId, {
        staffId: LOGIN_STAFF.id,
        title,
        date: start,
      })
      expect(created.status()).toBe(201)

      await openDay(page, effective)
      await ownEvent(page, title).click()
      await openRecurrenceChange(page)
      await page.getByTestId('recurring-rule-preset').selectOption('custom')
      await page.getByTestId('recurring-rule-day-of-week-2').check()
      await page.getByTestId('recurring-rule-day-of-week-1').uncheck()
      await page.getByTestId('schedule-recurrence-submit').click()

      await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`/schedule\\?.*date=${tuesday}`))
      await expect(ownEvent(page, title)).toBeVisible()
      await openDay(page, effective)
      await expect(ownEvent(page, title)).toHaveCount(0)
      await openDay(page, start)
      await expect(ownEvent(page, title)).toBeVisible()
    })

    test('今日より前の回から「繰り返しを変更」で曜日を変えた場合、今日以降の回を変えることが出て、今日より前の回は残ること', async ({
      page,
      request,
    }) => {
      const title = `E2E の過去の定例 ${Date.now()}`
      const start = daysFromToday(-14)
      const past = daysFromToday(-7)
      const nextWeekday = (isoWeekdayOf(start) % 7) + 1
      const token = await issueAccessToken(request, LOGIN_EMAIL)
      const created = await createWeeklyNormalSchedule(request, token, STAFF_FORM.facilityId, {
        staffId: LOGIN_STAFF.id,
        title,
        date: start,
      })
      expect(created.status()).toBe(201)

      await openDay(page, past)
      await ownEvent(page, title).click()
      await openRecurrenceChange(page)
      await expect(page.getByTestId('schedule-recurrence-lead')).toContainText(
        '今日より前の回は変わりません。',
      )
      await page.getByTestId('recurring-rule-preset').selectOption('custom')
      await page.getByTestId(`recurring-rule-day-of-week-${nextWeekday}`).check()
      await page.getByTestId(`recurring-rule-day-of-week-${isoWeekdayOf(start)}`).uncheck()
      await page.getByTestId('schedule-recurrence-submit').click()

      await expect(page.getByTestId('schedule-recurrence-modal')).toBeHidden()
      await expect(ownEvent(page, title)).toBeVisible()
      await openDay(page, past)
      await expect(ownEvent(page, title)).toBeVisible()
    })

    test('1 回だけ変えた回を開いた場合、「編集」はメニューにならず、単発の予定と同じボタンであること', async ({
      page,
      request,
    }) => {
      const title = `E2E の置き換えた定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const token = await issueAccessToken(request, LOGIN_EMAIL)
      const created = await createWeeklyNormalSchedule(request, token, STAFF_FORM.facilityId, {
        staffId: LOGIN_STAFF.id,
        title,
        date: start,
      })
      expect(created.status()).toBe(201)
      const { id } = (await created.json()) as { id: string }
      const moved = await replaceOccurrence(request, token, id, fromNextMonday(7), {
        staffId: LOGIN_STAFF.id,
        title,
        date: fromNextMonday(8),
      })
      expect(moved.status()).toBe(201)
      const replaced = (await moved.json()) as { id: string }

      // 同じ時刻のほかの spec の予定と重なり、カレンダーの予定を押せないことがあるので、詳細の URL を開く
      await page.goto(`/schedule/${replaced.id}?view=day&date=${fromNextMonday(8)}`)

      await expect(page.getByTestId('schedule-detail-edit')).not.toHaveAttribute('aria-haspopup')
      await page.getByTestId('schedule-detail-edit').click()
      await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
    })
  })
})
