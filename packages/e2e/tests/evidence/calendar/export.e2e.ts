import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { CALENDARPIT_URL, HAYASHI, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { findGoogleEvent } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'

test.describe('確認が必要な予定', () => {
  test.describe(`Google カレンダーへの書き出し（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('calendar-export-create カレンダーを結び付けた職員の予定を buddy で作った場合、職員の Google カレンダーに同じタイトルで出ること', async ({
      browser,
      context,
      request,
    }) => {
      const title = `会議 ${Date.now()}`
      // 予定の API は、結び付けた職員の予定だけを書き出す
      await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, (page) =>
        linkStaffCalendar(page, HAYASHI.id),
      )

      const page = await context.newPage()
      try {
        await page.goto('/schedule?view=day')
        await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
        await intro(
          page,
          `カレンダーを結び付けた林 さくらの予定を buddy で作ると、林の Google カレンダー（calendarpit）に同じタイトルで出る\n前提 ${HAYASHI.name} に Google カレンダー（${HAYASHI.calendarId}、calendarpit）を結び付けてあり、日の表示を開いている`,
        )

        await step(
          page,
          `「予定を作成」を押し、タイトル「${title}」、予定者 ${HAYASHI.name} で作る`,
          async () => {
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-normal').check()
            await page.getByTestId('schedule-field-title').click()
            await page.getByTestId('schedule-form-title').fill(title)
            await page.getByTestId('schedule-field-staff').click()
            await page.getByTestId(`staff-select-option-${HAYASHI.id}`).check()
            await page.getByTestId('schedule-create-submit').click()
          },
        )
        await check(page, `日の表示の ${HAYASHI.name} の列に「${title}」が出る`, async () => {
          await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
          await expect(
            page
              .getByTestId(`day-grid-staff-${HAYASHI.id}`)
              .getByTestId(/^schedule-event-/)
              .filter({ hasText: title }),
          ).toBeVisible()
        })

        // 書き出しは別の処理が行うので、calendarpit に出るまで待ってから、書き出された予定の日を開く
        await expect
          .poll(async () => (await findGoogleEvent(request, HAYASHI.calendarId, title))?.status)
          .toBe('confirmed')
        const event = await findGoogleEvent(request, HAYASHI.calendarId, title)
        const date = event?.start?.dateTime?.slice(0, 10) ?? ''
        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${HAYASHI.calendarId} の ${date} を開く`,
          () =>
            page
              .goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${date}`,
              )
              .then(() => undefined),
        )
        await check(page, `${HAYASHI.calendarId} に「${title}」が出る`, () =>
          expect(calendarpitEvent(page, title)).toBeVisible(),
        )
      } finally {
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, HAYASHI.id),
        )
      }
    })
  })
})
