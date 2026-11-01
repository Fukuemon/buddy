import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { SATO } from '../../fixtures/env'
import { findGoogleEvent, holdGoogleChanges, shiftGoogleEvent } from '../../fixtures/googleCalendar'
import { detailDateTime, SCHEDULE_DETAIL_URL, scheduleIdFromUrl } from '../../fixtures/schedule'

const findEvent = (request: APIRequestContext, summary: string) =>
  findGoogleEvent(request, SATO.calendarId, summary)

/** 日の表示で、佐藤の予定のうちタイトルが title のものを開き、予定の ID を返す。 */
const openSchedule = async (page: Page, title: string) => {
  await page.goto('/schedule?view=day')
  await page
    .getByTestId(`day-grid-staff-${SATO.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })
    .click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
  await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
  return scheduleIdFromUrl(page.url())
}

/** 確認が必要な予定の一覧の、予定の行。前のテストが同じ職員の行を残していても、今回の予定の行だけを指す。 */
const reviewRow = (page: Page, scheduleId: string) =>
  page.getByTestId(`calendar-review-row-schedule-${scheduleId}`)

test.describe('確認が必要な予定', () => {
  test.describe('Google カレンダーとの同期', () => {
    // 途中で落ちても、後の spec が Google の変更を受け取れ、やり直しで佐藤にもう一度結び付けられるようにする
    test.afterEach(async ({ page, request }) => {
      await holdGoogleChanges(request, false)
      await page.goto('/schedule/link')
      const menu = page.getByTestId(`calendar-link-menu-${SATO.id}`)
      await expect(page.getByTestId(`calendar-link-row-${SATO.id}`)).toBeVisible()
      if (await menu.isVisible()) {
        await menu.click()
        await page.getByTestId(`calendar-link-remove-${SATO.id}`).click()
        await page.getByTestId('calendar-unlink-submit').click()
        await expect(menu).toBeHidden()
      }
    })

    test('Google カレンダーで直した予定が buddy に出て、両方で変わった予定は Google の内容に合わせられること', async ({
      page,
      request,
    }) => {
      const stamp = Date.now()
      const created = `E2E の同期 ${stamp}`
      const changed = `E2E の同期（buddy で変更）${stamp}`
      let eventId = ''
      let scheduleId = ''

      await test.step('佐藤に Google カレンダーを結び付け、buddy で作った予定を Google カレンダーに出す', async () => {
        await page.goto('/schedule/link')
        await page.getByTestId(`calendar-link-open-${SATO.id}`).click()
        await expect(page.getByTestId('calendar-link-input')).toHaveValue(SATO.calendarId)
        await page.getByTestId('calendar-link-check').click()
        await expect(page.getByTestId('calendar-link-check-result')).toContainText('読めました。')
        await page.getByTestId('calendar-link-submit').click()
        await expect(page.getByTestId(`calendar-link-calendar-id-${SATO.id}`)).toHaveText(
          SATO.calendarId,
        )

        await page.goto('/schedule?view=day')
        await expect(page.getByTestId(`day-grid-staff-${SATO.id}`)).toBeVisible()
        await page.getByTestId('schedule-create-open').click()
        await page.getByTestId('schedule-kind-tab-normal').check()
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(created)
        await page.getByTestId('schedule-field-staff').click()
        await page.getByTestId(`staff-select-option-${SATO.id}`).check()
        await page.getByTestId('schedule-create-submit').click()
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()

        await expect.poll(async () => (await findEvent(request, created))?.status).toBe('confirmed')
        eventId = (await findEvent(request, created))?.id ?? ''
      })

      await test.step('職員が Google カレンダーで予定を遅らせると、buddy の予定も遅れる', async () => {
        await shiftGoogleEvent(request, SATO.calendarId, eventId)
        const shifted = detailDateTime(await findEvent(request, created))

        // 予定の API が数秒ごとに Google の変更を読むので、出るまで開き直す
        await expect(async () => {
          await openSchedule(page, created)
          await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(shifted)
        }).toPass()
      })

      await test.step('buddy と Google カレンダーの両方で変えると、確認が必要な予定に出る', async () => {
        await holdGoogleChanges(request, true)
        await shiftGoogleEvent(request, SATO.calendarId, eventId)
        scheduleId = await openSchedule(page, created)
        await page.getByTestId('schedule-detail-edit').click()
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(changed)
        await page.getByTestId('schedule-edit-submit').click()
        await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()

        await page.goto('/schedule/review')
        const row = reviewRow(page, scheduleId)
        await expect(async () => {
          await page.reload()
          await expect(row).toBeVisible()
        }).toPass()
        await expect(row.getByTestId(/^calendar-review-reason-/)).toHaveText(
          'buddy と Google カレンダーの両方で予定が変わりました。',
        )
        await holdGoogleChanges(request, false)
      })

      await test.step('Google の内容に合わせると、一覧から消え、buddy の予定が Google カレンダーのタイトルと日時になる', async () => {
        await reviewRow(page, scheduleId).click()
        await page
          .getByTestId('calendar-review-dialog')
          .getByTestId(/^calendar-review-accept-/)
          .click()
        const dialog = page.getByTestId('calendar-accept-dialog')
        await expect(dialog).toContainText('buddy で変えたタイトルと日時は消えます。')
        await page.getByTestId('calendar-accept-submit').click()
        await expect(dialog).toBeHidden()
        await expect(reviewRow(page, scheduleId)).toHaveCount(0)

        const google = await findEvent(request, created)
        expect(google?.id).toBe(eventId)
        await openSchedule(page, created)
        await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
          detailDateTime(google),
        )
        await expect(page.getByTestId('schedule-detail-modal')).not.toContainText(changed)
      })
    })
  })
})
