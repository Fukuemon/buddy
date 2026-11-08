import { expect, test, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { createWeeklyNormalSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

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

test.describe('予定の編集', () => {
  test.describe('繰り返しの予定の規則の変更', () => {
    test('毎週月曜の繰り返しの予定の回で「この日以降の全ての回」を選び毎週火曜にした場合、その日以降は火曜に出て、その日より前の月曜の回は残ること', async ({
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
      await page.getByTestId('schedule-detail-edit').click()
      await expect(page.getByTestId('schedule-edit-scope-occurrence')).toBeChecked()
      await page.getByTestId('schedule-edit-scope-following').check()
      await expect(page.getByTestId('schedule-edit-rule-lead')).toContainText(effective)
      await page.getByTestId('recurring-rule-day-of-week-2').check()
      await page.getByTestId('schedule-edit-submit').click()

      await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`/schedule\\?.*date=${tuesday}`))
      await expect(ownEvent(page, title)).toBeVisible()
      await openDay(page, effective)
      await expect(ownEvent(page, title)).toHaveCount(0)
      await openDay(page, start)
      await expect(ownEvent(page, title)).toBeVisible()
    })

    test('今日より前の回で「この日以降の全ての回」を選んだ場合、変えられないことが出て、保存を押せないこと', async ({
      page,
      request,
    }) => {
      const title = `E2E の過去の定例 ${Date.now()}`
      const start = daysFromToday(-14)
      const token = await issueAccessToken(request, LOGIN_EMAIL)
      const created = await createWeeklyNormalSchedule(request, token, STAFF_FORM.facilityId, {
        staffId: LOGIN_STAFF.id,
        title,
        date: start,
      })
      expect(created.status()).toBe(201)

      await openDay(page, daysFromToday(-7))
      await ownEvent(page, title).click()
      await page.getByTestId('schedule-detail-edit').click()
      await page.getByTestId('schedule-edit-scope-following').check()

      await expect(page.getByTestId('schedule-edit-rule-past')).toBeVisible()
      await expect(page.getByTestId('schedule-edit-submit')).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })
  })
})
