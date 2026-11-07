import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference, prepareApiReference } from '../../fixtures/apiReference'
import { CALENDARPIT_URL, HAYASHI, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { listGoogleEvents } from '../../fixtures/googleCalendar'
import { createWeeklyNormalSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
  openApiClient,
} from '../../screens/apiReference'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'
import { apiClient } from '../../selectors/apiReference'
import { calendarpitEvent } from '../../selectors/calendarpit'

const CHANGE_RULE = {
  tag: 'schedule',
  method: 'put',
  path: '/v1/schedules/recurring/{recurring_schedule_id}/rule',
}

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/** 日の表示の staffId の列の、text を含む予定。 */
const dayEvent = (page: Page, staffId: string, text: string) =>
  page
    .getByTestId(`day-grid-staff-${staffId}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: text })

const openDay = async (page: Page, staffId: string, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${staffId}`)).toBeVisible()
}

/** calendarpit の calendarId の予定のうち、タイトルが title で、RRULE に rule を含む繰り返しの予定。 */
const findRecurringGoogleEvent = async (
  request: APIRequestContext,
  calendarId: string,
  title: string,
  rule: string,
) =>
  (await listGoogleEvents(request, calendarId)).find(
    (event) => event.summary === title && event.recurrence?.some((line) => line.includes(rule)),
  )

/** 規則の変更のクライアントを開き、トークンと繰り返しの予定の ID と本文を入れて送り、レスポンスの本文を返す。 */
const sendChangeRule = async (page: Page, token: string, recurringScheduleId: string, body: unknown) => {
  await openApiClient(page, 'schedule', CHANGE_RULE)
  await fillApiToken(page, token)
  await fillApiVariable(page, 'recurring_schedule_id', recurringScheduleId)
  await fillApiBody(page, body)
  const response = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith('/rule'),
  )
  await apiClient(page).send.click()
  return (await (await response).json()) as { id: string; date: string }
}

test.describe('予定の API', () => {
  test.describe('繰り返しの予定の規則の変更', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}buddy を正本にする事業所で、毎週月曜の繰り返しの予定を API で毎週火曜に変えた場合、予定の表示と Google カレンダーの予定が火曜になること`, async ({
        browser,
        request,
      }) => {
        const title = `定例 ${Date.now()}`
        const start = fromNextMonday(0)
        const effective = fromNextMonday(7)
        const tuesday = fromNextMonday(8)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-rule-buddy-primary',
            title:
              'buddy を正本にする事業所で、毎週月曜の繰り返しの予定を適用の日から毎週火曜に変えると、予定の表示と林の Google カレンダー（calendarpit）が火曜になる',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule/link')
            await signInAtBroker(page, LOGIN_EMAIL)
            await linkStaffCalendar(page, HAYASHI.id)
            const token = await issueAccessToken(page.request, LOGIN_EMAIL)
            const created = await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title,
              date: start,
            })
            expect(created.status()).toBe(201)
            const { id } = (await created.json()) as { id: string }
            await prepareApiReference('schedule', null)(page)
            return { token, id }
          },
          async ({ page, step, check }, { token, id }) => {
            try {
              await openDay(page, HAYASHI.id, effective)
              await expect(dayEvent(page, HAYASHI.id, title)).toBeVisible()
              await step(
                `${HAYASHI.name} に Google カレンダーを結び付け、${start} から毎週月曜の「${title}」を API で作ってある。${effective}（月曜）の日の表示を開いている`,
              )
              await check(`${effective}（月曜）に「${title}」が出る`)

              await routeApiReference(page)
              await step(
                `API の参照のページの「繰り返しの予定の規則を、適用の日以降の回について変える」で、適用の日を ${effective} にして毎週火曜に変える`,
              )
              await sendChangeRule(page, token, id, {
                effective_date: effective,
                recurring_rule: { frequency: 'weekly', day_of_week: 2 },
              })
              const dialog = apiClient(page).dialog
              await expect(dialog).toContainText('200 OK')
              await expect(dialog).toContainText(`"date": "${tuesday}"`)
              await expect(dialog).toContainText('"day_of_week": 2')
              await check(
                `200 が返り、最初の日付が ${tuesday}（火曜）、曜日が 2（火曜）の新しい繰り返しの予定が返る`,
              )

              await step(`${effective}（月曜）と ${tuesday}（火曜）の日の表示を開く`)
              await openDay(page, HAYASHI.id, effective)
              await expect(dayEvent(page, HAYASHI.id, title)).toBeHidden()
              await check(`${effective}（月曜）に「${title}」が出ない`)
              await openDay(page, HAYASHI.id, tuesday)
              await expect(dayEvent(page, HAYASHI.id, title)).toBeVisible()
              await check(`${tuesday}（火曜）に「${title}」が出る`)

              // 書き出しは別の処理が行うので、calendarpit に火曜の繰り返しの予定ができるまで待ってから管理の画面を開く
              await expect
                .poll(
                  async () =>
                    (await findRecurringGoogleEvent(request, HAYASHI.calendarId, title, 'BYDAY=TU')) !==
                    undefined,
                )
                .toBe(true)
              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${HAYASHI.calendarId} の ${tuesday} を開く`,
              )
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${tuesday}`,
              )
              await expect(calendarpitEvent(page, title)).toBeVisible()
              await check(`${HAYASHI.calendarId} の ${tuesday}（火曜）に「${title}」が出る`)
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
