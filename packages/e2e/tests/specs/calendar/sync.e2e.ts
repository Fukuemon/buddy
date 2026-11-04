import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { SATO } from '../../fixtures/env'
import { findGoogleEvent, shiftGoogleEvent } from '../../fixtures/googleCalendar'
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

// シードの 1 つ目の事業所は buddy を予定の正本にする（buddy_primary）。同期はこの事業所のカレンダーを読まず、
// Google カレンダーでの変更を buddy の予定に当てない（ADR-0035）。
test.describe('確認が必要な予定', () => {
  test.describe('Google カレンダーとの同期', () => {
    // 途中で落ちても、やり直しで佐藤にもう一度結び付けられるようにする
    test.afterEach(async ({ page }) => {
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

    test('buddy を正本にする事業所で Google カレンダーの予定を直した場合、buddy の予定に当たらず、buddy で変えると確認が必要な予定に出て、Google の内容には合わせられないこと', async ({
      page,
      request,
    }) => {
      const stamp = Date.now()
      const created = `E2E の同期 ${stamp}`
      const changed = `E2E の同期（buddy で変更）${stamp}`
      let eventId = ''
      let scheduleId = ''
      let createdDateTime = ''

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
        const event = await findEvent(request, created)
        eventId = event?.id ?? ''
        createdDateTime = detailDateTime(event)
      })

      await test.step('職員が Google カレンダーで予定を遅らせた後に buddy で変えると、確認が必要な予定に出る', async () => {
        await shiftGoogleEvent(request, SATO.calendarId, eventId)
        scheduleId = await openSchedule(page, created)
        await page.getByTestId('schedule-detail-edit').click()
        await page.getByTestId('schedule-field-title').click()
        await page.getByTestId('schedule-form-title').fill(changed)
        await page.getByTestId('schedule-edit-submit').click()
        await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()

        // 書き出しが Google の変更を見つけて（412）確認が必要な予定にするまで、一覧を開き直す
        await page.goto('/schedule/review')
        const row = reviewRow(page, scheduleId)
        await expect(async () => {
          await page.reload()
          await expect(row).toBeVisible()
        }).toPass()
        await expect(row.getByTestId(/^calendar-review-reason-/)).toHaveText(
          'buddy と Google カレンダーの両方で予定が変わりました。',
        )
      })

      await test.step('確認が必要な予定に出た後も、buddy の予定の日時は Google で遅らせる前のままである', async () => {
        await openSchedule(page, changed)
        await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(createdDateTime)
      })

      await test.step('Google の内容に合わせようとすると拒まれ、一覧に残り、buddy の予定は buddy で変えたタイトルのままになる', async () => {
        await page.goto('/schedule/review')
        await reviewRow(page, scheduleId).click()
        await page
          .getByTestId('calendar-review-dialog')
          .getByTestId(/^calendar-review-accept-/)
          .click()
        const dialog = page.getByTestId('calendar-accept-dialog')
        await expect(dialog).toContainText('buddy で変えたタイトルと日時は消えます。')
        await page.getByTestId('calendar-accept-submit').click()
        await expect(dialog.getByTestId('calendar-accept-error')).toHaveText(
          'この予定は、Google カレンダーの内容に合わせられません。buddy の内容で書き直してください。',
        )
        await page.goto('/schedule/review')
        await expect(reviewRow(page, scheduleId)).toBeVisible()

        await openSchedule(page, changed)
        await expect(page.getByTestId('schedule-detail-modal')).toContainText(changed)
      })
    })
  })
})
