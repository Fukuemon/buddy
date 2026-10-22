import { expect, test, type Page } from '@playwright/test'

import { CALENDARPIT_URL, HAYASHI, LOGIN_NAME, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { findGoogleEvent } from '../../fixtures/googleCalendar'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtIdp } from '../../screens/login'
import { calendarpitEvent } from '../../selectors/calendarpit'

/** ログインして、林にカレンダーを結び付ける。予定の API は、結び付けた職員の予定だけを書き出す。 */
const prepareHayashiLinked = async (page: Page) => {
  await page.goto('/schedule/link')
  await signInAtIdp(page, LOGIN_NAME)
  await linkStaffCalendar(page, HAYASHI.id)
}

test.describe('確かめが要る予定', () => {
  test.describe('Google カレンダーへの書き出し', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}カレンダーを結び付けた職員の予定を buddy で作った場合、職員の Google カレンダーに同じタイトルで出ること`, async ({
        browser,
        request,
      }) => {
        const title = `会議 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-export-create',
            title:
              'カレンダーを結び付けた林 さくらの予定を buddy で作ると、林の Google カレンダー（calendarpit）に同じタイトルで出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          prepareHayashiLinked,
          async ({ page, step, check }) => {
            try {
              await page.goto('/schedule?view=day')
              await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
              await step(
                `${HAYASHI.name} に Google カレンダー（${HAYASHI.calendarId}、calendarpit）を結び付けてあり、日の表示を開いている`,
              )

              await step(
                `「予定を作成」を押し、タイトル「${title}」、予定者 ${HAYASHI.name} で作る`,
              )
              await page.getByTestId('schedule-create-open').click()
              await page.getByTestId('schedule-kind-tab-normal').check()
              await page.getByTestId('schedule-field-title').click()
              await page.getByTestId('schedule-form-title').fill(title)
              await page.getByTestId('schedule-field-staff').click()
              await page.getByTestId(`staff-select-option-${HAYASHI.id}`).check()
              await page.getByTestId('schedule-create-submit').click()
              await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
              await expect(
                page
                  .getByTestId(`day-grid-staff-${HAYASHI.id}`)
                  .getByTestId(/^schedule-event-/)
                  .filter({ hasText: title }),
              ).toBeVisible()
              await check(`日の表示の ${HAYASHI.name} の列に「${title}」が出る`)

              // 書き出しは別の処理が行うので、calendarpit に出るまで待ってから管理の画面を開く
              await expect
                .poll(
                  async () => (await findGoogleEvent(request, HAYASHI.calendarId, title))?.status,
                )
                .toBe('confirmed')
              const event = await findGoogleEvent(request, HAYASHI.calendarId, title)
              const date = event?.start?.dateTime?.slice(0, 10) ?? ''
              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${HAYASHI.calendarId} の ${date} を開く`,
              )
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, title)).toBeVisible()
              await check(`${HAYASHI.calendarId} に「${title}」が出る`)
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, HAYASHI.id)
            }
          },
        )
      })
    }
  })
})
