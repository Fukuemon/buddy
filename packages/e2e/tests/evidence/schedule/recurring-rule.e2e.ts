import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  CALENDARPIT_URL,
  HAYASHI,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  OKADA,
  OKADA_STATE,
  SCHEDULE_URL,
} from '../../fixtures/env'
import { deleteGoogleEvent, listGoogleEvents } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { createWeeklyNormalSchedule, newScheduleId } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { openApiClient } from '../../screens/apiReference'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'
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

/**
 * 予定の一覧（listSchedules）で、facilityId の事業所の date の予定のうち、タイトルが title の繰り返しの回の etag を返す。
 * google_primary の事業所の回の etag は、親の予定の etag である。
 */
const listedEtag = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  date: string,
  title: string,
) => {
  const res = await request.get(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { date_from: date, date_to: date },
  })
  expect(res.ok()).toBe(true)
  const { schedules } = (await res.json()) as {
    schedules: { title: string | null; etag: string | null }[]
  }
  const etag = schedules.find((schedule) => schedule.title === title)?.etag
  if (etag == null) throw new Error(`${date} の「${title}」の回が一覧に無い`)
  return etag
}

/** 規則の変更のクライアントを開き、トークンと繰り返しの予定の ID と本文を入れて送り、レスポンスの本文を返す。 */
const sendChangeRule = async (
  page: Page,
  token: string,
  recurringScheduleId: string,
  body: unknown,
) => {
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

/** API の参照のページを撮る compose の API へ向け、規則の変更の「Test Request」から body を送る操作を、text の字幕で行う。 */
const changeRuleByApi = async (
  page: Page,
  text: string,
  token: string,
  recurringScheduleId: string,
  body: unknown,
) => {
  await step(page, text, async () => {
    await routeApiReference(page)
    await sendChangeRule(page, token, recurringScheduleId, body)
  })
}

test.describe('予定の API', () => {
  test.describe(`繰り返しの予定の規則の変更（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('recurring-rule-buddy-primary buddy を正本にする事業所で、毎週月曜の繰り返しの予定を API で毎週火曜に変えた場合、予定の表示と Google カレンダーの予定が火曜になること', async ({
      browser,
      context,
      request,
    }) => {
      const title = `定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const effective = fromNextMonday(7)
      const tuesday = fromNextMonday(8)
      const { token, id } = await prepareOutsideRecording(
        browser,
        { storageState: LOGIN_STATE },
        async (page) => {
          await linkStaffCalendar(page, HAYASHI.id)
          const token = await issueAccessToken(page.request, LOGIN_EMAIL)
          const created = await createWeeklyNormalSchedule(
            page.request,
            token,
            STAFF_FORM.facilityId,
            {
              staffId: HAYASHI.id,
              title,
              date: start,
            },
          )
          expect(created.status()).toBe(201)
          const { id } = (await created.json()) as { id: string }
          return { token, id }
        },
      )

      const page = await context.newPage()
      try {
        await openDay(page, HAYASHI.id, effective)
        await expect(dayEvent(page, HAYASHI.id, title)).toBeVisible()
        await intro(
          page,
          `buddy を正本にする事業所で、毎週月曜の繰り返しの予定を適用の日から毎週火曜に変えると、予定の表示と林の Google カレンダー（calendarpit）が火曜になる\n前提 ${HAYASHI.name} に Google カレンダーを結び付け、${start} から毎週月曜の「${title}」を API で作ってある。${effective}（月曜）の日の表示を開いている`,
        )
        await check(page, `${effective}（月曜）に「${title}」が出る`, () =>
          expect(dayEvent(page, HAYASHI.id, title)).toBeVisible(),
        )

        await changeRuleByApi(
          page,
          `API の参照のページの「繰り返しの予定の規則を、適用の日以降の回について変える」で、適用の日を ${effective} にして毎週火曜に変える`,
          token,
          id,
          {
            effective_date: effective,
            recurring_rule: { frequency: 'weekly', days_of_week: [2] },
          },
        )
        await check(
          page,
          `200 が返り、最初の日付が ${tuesday}（火曜）、曜日が 2（火曜）の新しい繰り返しの予定が返る`,
          async () => {
            const dialog = apiClient(page).dialog
            await expect(dialog).toContainText('200 OK')
            await expect(dialog).toContainText(`"date": "${tuesday}"`)
            await expect(dialog).toContainText(/"days_of_week": \[\s*2\s*\]/)
          },
        )

        await step(page, `${effective}（月曜）の日の表示を開く`, () =>
          openDay(page, HAYASHI.id, effective),
        )
        await check(page, `${effective}（月曜）に「${title}」が出ない`, () =>
          expect(dayEvent(page, HAYASHI.id, title)).toBeHidden(),
        )
        await step(page, `${tuesday}（火曜）の日の表示を開く`, () =>
          openDay(page, HAYASHI.id, tuesday),
        )
        await check(page, `${tuesday}（火曜）に「${title}」が出る`, () =>
          expect(dayEvent(page, HAYASHI.id, title)).toBeVisible(),
        )

        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${HAYASHI.calendarId} の ${tuesday} を開く`,
          async () => {
            // 書き出しは別の処理が行うので、calendarpit に火曜の繰り返しの予定ができるまで待ってから管理の画面を開く
            await expect
              .poll(
                async () =>
                  (await findRecurringGoogleEvent(
                    request,
                    HAYASHI.calendarId,
                    title,
                    'BYDAY=TU',
                  )) !== undefined,
              )
              .toBe(true)
            await page.goto(
              `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${tuesday}`,
            )
          },
        )
        await check(page, `${HAYASHI.calendarId} の ${tuesday}（火曜）に「${title}」が出る`, () =>
          expect(calendarpitEvent(page, title)).toBeVisible(),
        )
      } finally {
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, HAYASHI.id),
        )
      }
    })
  })

  test.describe(`繰り返しの予定の規則の変更（${OKADA.staff.name}、Google カレンダーを正本にする事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('recurring-rule-google-primary Google カレンダーを正本にする事業所で、毎週月曜の繰り返しの予定を API で毎週火曜に変えた場合、calendarpit の親の予定の RRULE が火曜になり、予定の表示が火曜の回を出すこと', async ({
      browser,
      context,
      request,
    }) => {
      const title = `定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const effective = fromNextMonday(7)
      const tuesday = fromNextMonday(8)
      const { token, id, etag } = await prepareOutsideRecording(
        browser,
        { storageState: OKADA_STATE },
        async (page) => {
          const token = await issueAccessToken(page.request, OKADA.email)
          const id = newScheduleId()
          const created = await createWeeklyNormalSchedule(page.request, token, OKADA.facilityId, {
            id,
            staffId: OKADA.staff.id,
            title,
            date: start,
          })
          expect(created.status()).toBe(201)
          const etag = await listedEtag(page.request, token, OKADA.facilityId, effective, title)
          return { token, id, etag }
        },
      )

      const page = await context.newPage()
      try {
        await openDay(page, OKADA.staff.id, effective)
        await expect(dayEvent(page, OKADA.staff.id, title)).toBeVisible()
        await intro(
          page,
          `Google カレンダーを正本にする事業所で、毎週月曜の繰り返しの予定を適用の日から毎週火曜に変えると、calendarpit の親の予定の RRULE が火曜になり、予定の表示が火曜の回を出す\n前提 ${start} から毎週月曜の「${title}」を API で ${OKADA.staff.name} の Google カレンダーに作ってある。${effective}（月曜）の日の表示を開いている`,
        )
        await check(page, `${effective}（月曜）に「${title}」が出る`, () =>
          expect(dayEvent(page, OKADA.staff.id, title)).toBeVisible(),
        )

        await changeRuleByApi(
          page,
          `API の参照のページの「繰り返しの予定の規則を、適用の日以降の回について変える」で、予定の一覧で読んだ親の予定の etag を付け、適用の日を ${effective} にして毎週火曜に変える`,
          token,
          id,
          {
            effective_date: effective,
            recurring_rule: { frequency: 'weekly', days_of_week: [2] },
            id: newScheduleId(),
            etag,
          },
        )
        await check(
          page,
          `200 が返り、最初の日付が ${tuesday}（火曜）の新しい繰り返しの予定が返る`,
          async () => {
            const dialog = apiClient(page).dialog
            await expect(dialog).toContainText('200 OK')
            await expect(dialog).toContainText(`"date": "${tuesday}"`)
            await expect(dialog).toContainText(/"days_of_week": \[\s*2\s*\]/)
          },
        )

        const until = effective.replaceAll('-', '')
        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${tuesday} を開く（元の親の RRULE は ${until} より前に終わる）`,
          async () => {
            await expect
              .poll(async () => {
                const tue = await findRecurringGoogleEvent(
                  request,
                  OKADA.calendarId,
                  title,
                  'BYDAY=TU',
                )
                const mon = await findRecurringGoogleEvent(
                  request,
                  OKADA.calendarId,
                  title,
                  'BYDAY=MO',
                )
                return (
                  tue !== undefined &&
                  mon?.recurrence?.some((line) => line.includes('UNTIL=')) === true
                )
              })
              .toBe(true)
            await page.goto(
              `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${tuesday}`,
            )
          },
        )
        await check(page, `${OKADA.calendarId} の ${tuesday}（火曜）に「${title}」が出る`, () =>
          expect(calendarpitEvent(page, title)).toBeVisible(),
        )

        await step(page, `予定のカレンダーで、${effective}（月曜）の日の表示を開く`, () =>
          openDay(page, OKADA.staff.id, effective),
        )
        await check(page, `${effective}（月曜）に「${title}」が出ない`, () =>
          expect(dayEvent(page, OKADA.staff.id, title)).toBeHidden(),
        )
        await step(page, `${tuesday}（火曜）の日の表示を開く`, () =>
          openDay(page, OKADA.staff.id, tuesday),
        )
        await check(page, `${tuesday}（火曜）に「${title}」が出る`, () =>
          expect(dayEvent(page, OKADA.staff.id, title)).toBeVisible(),
        )
      } finally {
        for (const event of await listGoogleEvents(request, OKADA.calendarId)) {
          if (event.summary === title) await deleteGoogleEvent(request, OKADA.calendarId, event.id)
        }
      }
    })
  })
})
