import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { HAYASHI, LOGIN_EMAIL, LOGIN_STAFF, OKADA, SCHEDULE_URL } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { listGoogleEvents } from '../../fixtures/googleCalendar'
import {
  createNormalSchedule,
  createWeeklyNormalSchedule,
  getSchedule,
  replaceOccurrence,
} from '../../fixtures/schedule'
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

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/**
 * 録画の外で web に青木 陽菜でログインし、API の参照のページを開いて、青木 陽菜のトークンを返す。
 * setup は、ログインした後に前提のデータを作る。
 */
const prepare =
  <T>(setup: (page: Page, token: string) => Promise<T>) =>
  async (page: Page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, LOGIN_EMAIL)
    const token = await issueAccessToken(page.request, LOGIN_EMAIL)
    const data = await setup(page, token)
    await routeApiReference(page)
    await page.goto('http://localhost:8000/api/schedule.html')
    return { token, data }
  }

const id = async (res: Awaited<ReturnType<APIRequestContext['post']>>) => {
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** API の参照のページで、予定 scheduleId の削除（deleteSchedule）を送り、応答に status が出るのを待つ。 */
const sendDelete = async (page: Page, token: string, scheduleId: string, status: string) => {
  await openApiClient(page, 'schedule', {
    tag: 'schedule',
    method: 'delete',
    path: '/v1/schedules/{schedule_id}',
  })
  await fillApiToken(page, token)
  await fillApiVariable(page, 'schedule_id', scheduleId)
  await apiClient(page).send.click()
  await expect(apiClient(page).dialog).toContainText(status)
}

/** API の参照のページで、繰り返しの予定の回の削除（deleteOccurrence）を送る。 */
const sendDeleteOccurrence = async (
  page: Page,
  token: string,
  recurringId: string,
  date: string,
  status: string,
) => {
  await openApiClient(page, 'schedule', {
    tag: 'schedule',
    method: 'post',
    path: '/v1/schedules/recurring/{recurring_schedule_id}/occurrences/delete',
  })
  await fillApiToken(page, token)
  await fillApiVariable(page, 'recurring_schedule_id', recurringId)
  await fillApiBody(page, { original_date: date })
  await apiClient(page).send.click()
  await expect(apiClient(page).dialog).toContainText(status)
}

/** 「キャンセルした予定を出す」を入れた日の表示で、林 さくらの列に title の予定が出るか（shown）を確かめる。 */
const checkDay = async (
  page: Page,
  check: (text: string) => Promise<void>,
  date: string,
  title: string,
  shown: boolean,
  label: string,
) => {
  await page.goto(`/schedule?view=day&date=${date}&cancelled=true`)
  const column = page.getByTestId(`day-grid-staff-${HAYASHI.id}`)
  await expect(column).toBeVisible()
  const event = column.getByTestId(/^schedule-event-/).filter({ hasText: title })
  if (shown) await expect(event.first()).toBeVisible()
  else await expect(event).toHaveCount(0)
  await check(
    `${label}: 「キャンセルした予定を出す」を入れた ${date} の日の表示に「${title}」が${shown ? '出る' : '出ない'}`,
  )
}

/**
 * google_primary の事業所の職員が送る、buddy の予定のテーブルに無い ID。
 * ほかの事業所の予定の ID を送ると、認証のミドルウェアが事業所の違いで 403 にするので、どの事業所にも無い ID にする。
 */
const MISSING_ID = '01M3TCZZZZZZZZZZZZZZZZZZZZ'

const actor = `${LOGIN_STAFF.name}（マネージャー）`

test.describe('予定の API の予定の削除', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}1-1 単発の予定の削除`, async ({ browser }) => {
      const title = `誤入力の予定 ${Date.now()}`
      const date = daysFromToday(1)
      await recordPrEvidence(
        browser,
        {
          name: '1-1',
          title: '単発の予定の削除',
          actor,
          variant,
        },
        prepare(async (page, token) =>
          id(
            await createNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title,
              date,
            }),
          ),
        ),
        async ({ page, step, check }, { token, data: scheduleId }) => {
          await routeApiReference(page)
          await step(`API で ${HAYASHI.name} の ${date} に「${title}」を作った`)
          await checkDay(page, check, date, title, true, '削除の前')
          await step('API の参照のページで、予定の削除（deleteSchedule）を送る')
          await sendDelete(page, token, scheduleId, '204')
          await check('予定の削除の応答は 204 である')
          await checkDay(page, check, date, title, false, '削除の後')
          const res = await getSchedule(page.request, token, scheduleId)
          expect(res.status()).toBe(404)
          await check('削除した予定の取得（getSchedule）は 404 を返す')
        },
      )
    })

    test(`${prefix}1-2 繰り返しの予定の回の削除`, async ({ browser }) => {
      const title = `誤入力の定例 ${Date.now()}`
      const target = fromNextMonday(7)
      await recordPrEvidence(
        browser,
        { name: '1-2', title: '繰り返しの予定の回の削除', actor, variant },
        prepare(async (page, token) =>
          id(
            await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title,
              date: fromNextMonday(0),
            }),
          ),
        ),
        async ({ page, step, check }, { token, data: recurringId }) => {
          await routeApiReference(page)
          await step(
            `API で ${HAYASHI.name} の ${fromNextMonday(0)} から毎週月曜の「${title}」を作った`,
          )
          await checkDay(page, check, target, title, true, '削除の前')
          await step(`API の参照のページで、${target} の回の削除（deleteOccurrence）を送る`)
          await sendDeleteOccurrence(page, token, recurringId, target, '204')
          await check('回の削除の応答は 204 である')
          await checkDay(page, check, target, title, false, '削除の後')
          await checkDay(page, check, fromNextMonday(14), title, true, '次の週の回')
        },
      )
    })

    test(`${prefix}1-3 置き換えた回の削除`, async ({ browser }) => {
      const title = `誤入力の定例 ${Date.now()}`
      const moved = `置き換えた回 ${Date.now()}`
      const target = fromNextMonday(7)
      await recordPrEvidence(
        browser,
        { name: '1-3', title: '置き換えた回の削除', actor, variant },
        prepare(async (page, token) => {
          const recurringId = await id(
            await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title,
              date: fromNextMonday(0),
            }),
          )
          return id(
            await replaceOccurrence(page.request, token, recurringId, target, {
              staffId: HAYASHI.id,
              title: moved,
              date: target,
            }),
          )
        }),
        async ({ page, step, check }, { token, data: replacedId }) => {
          await routeApiReference(page)
          await step(`API で毎週月曜の「${title}」を作り、${target} の回を「${moved}」に置き換えた`)
          await checkDay(page, check, target, moved, true, '削除の前')
          await step('API の参照のページで、置き換えた予定の削除（deleteSchedule）を送る')
          await sendDelete(page, token, replacedId, '204')
          await check('置き換えた予定の削除の応答は 204 である')
          await checkDay(page, check, target, moved, false, '削除の後（置き換えた予定）')
          await checkDay(page, check, target, title, false, '削除の後（元の回）')
          await checkDay(page, check, fromNextMonday(14), title, true, '次の週の回')
        },
      )
    })

    test(`${prefix}1-4 単発の予定の削除を拒む`, async ({ browser }) => {
      const past = `昨日の予定 ${Date.now()}`
      const cancelled = `キャンセルした予定 ${Date.now()}`
      const yesterday = daysFromToday(-1)
      const tomorrow = daysFromToday(1)
      await recordPrEvidence(
        browser,
        { name: '1-4', title: '単発の予定の削除を拒む', actor, variant },
        prepare(async (page, token) => {
          const pastId = await id(
            await createNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title: past,
              date: yesterday,
            }),
          )
          const cancelledId = await id(
            await createNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title: cancelled,
              date: tomorrow,
            }),
          )
          const res = await page.request.post(
            `${SCHEDULE_URL}/v1/schedules/${cancelledId}/cancel`,
            {
              headers: { Authorization: `Bearer ${token}` },
              data: { reason: '利用者の都合' },
            },
          )
          expect(res.status()).toBe(201)
          return { pastId, cancelledId, okada: await issueAccessToken(page.request, OKADA.email) }
        }),
        async ({ page, step, check }, { token, data }) => {
          await routeApiReference(page)
          await step(
            `API で ${yesterday} の「${past}」と、${tomorrow} の「${cancelled}」を作り、後者をキャンセルした`,
          )
          await sendDelete(page, token, data.pastId, '400')
          await expect(apiClient(page).dialog).toContainText('今日より前の予定は削除できません')
          await check(
            '昨日の予定の削除は 400（invalid_input）で、「今日より前の予定は削除できません」',
          )
          await checkDay(page, check, yesterday, past, true, '拒んだ後')
          await sendDelete(page, token, data.cancelledId, '409')
          await expect(apiClient(page).dialog).toContainText('"code": "conflict"')
          await check(
            'キャンセル済みの予定の削除は 409（conflict）で、「キャンセル済みの予定は削除できません」',
          )
          await checkDay(page, check, tomorrow, cancelled, true, '拒んだ後')
          await step(`google_primary の事業所の ${OKADA.staff.name} のトークンで、予定の削除を送る`)
          await sendDelete(page, data.okada, MISSING_ID, '409')
          await expect(apiClient(page).dialog).toContainText('"code": "google_primary"')
          await check('google_primary の事業所の予定の削除は 409（google_primary）である')
        },
      )
    })

    test(`${prefix}1-5 回の削除を拒む`, async ({ browser }) => {
      const title = `拒む定例 ${Date.now()}`
      await recordPrEvidence(
        browser,
        { name: '1-5', title: '回の削除を拒む', actor, variant },
        prepare(async (page, token) => {
          // 昨日の回があるよう、最初の日付を昨日にする
          const recurringId = await id(
            await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title,
              date: daysFromToday(-1),
            }),
          )
          const deleted = await page.request.post(
            `${SCHEDULE_URL}/v1/schedules/recurring/${recurringId}/occurrences/delete`,
            {
              headers: { Authorization: `Bearer ${token}` },
              data: { original_date: daysFromToday(6) },
            },
          )
          expect(deleted.status()).toBe(204)
          const cancelled = await page.request.post(
            `${SCHEDULE_URL}/v1/schedules/recurring/${recurringId}/occurrences/cancel`,
            {
              headers: { Authorization: `Bearer ${token}` },
              data: { original_date: daysFromToday(13), reason: '休み' },
            },
          )
          expect(cancelled.status()).toBe(201)
          return { recurringId, okada: await issueAccessToken(page.request, OKADA.email) }
        }),
        async ({ page, step, check }, { token, data }) => {
          await routeApiReference(page)
          await step(
            `API で ${daysFromToday(-1)} から毎週の「${title}」を作り、${daysFromToday(6)} の回を削除し、${daysFromToday(13)} の回をキャンセルした`,
          )
          const cases: [string, string, string][] = [
            [daysFromToday(1), '400', '回に当たらない日（明日）'],
            [daysFromToday(-1), '400', '昨日の回'],
            [daysFromToday(6), '409', '削除した回'],
            [daysFromToday(13), '409', 'キャンセルした回'],
          ]
          for (const [date, status, label] of cases) {
            await sendDeleteOccurrence(page, token, data.recurringId, date, status)
            await check(`${label}（${date}）の回の削除は ${status} である`)
          }
          await step(`google_primary の事業所の ${OKADA.staff.name} のトークンで、回の削除を送る`)
          await sendDeleteOccurrence(page, data.okada, MISSING_ID, daysFromToday(20), '409')
          await expect(apiClient(page).dialog).toContainText('"code": "google_primary"')
          await check('google_primary の事業所の回の削除は 409（google_primary）である')
        },
      )
    })

    test(`${prefix}1-6 Google カレンダーへの削除の書き出し`, async ({ browser, request }) => {
      const single = `書き出した予定 ${Date.now()}`
      const weekly = `書き出した定例 ${Date.now()}`
      const moved = `書き出した置き換え ${Date.now()}`
      await recordPrEvidence(
        browser,
        { name: '1-6', title: 'Google カレンダーへの削除の書き出し', actor, variant },
        prepare(async (page, token) => {
          await page.goto('/schedule/link')
          await linkStaffCalendar(page, HAYASHI.id)
          const singleId = await id(
            await createNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title: single,
              date: daysFromToday(1),
            }),
          )
          const recurringId = await id(
            await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title: weekly,
              date: fromNextMonday(0),
            }),
          )
          const movedId = await id(
            await replaceOccurrence(page.request, token, recurringId, fromNextMonday(14), {
              staffId: HAYASHI.id,
              title: moved,
              date: fromNextMonday(14),
            }),
          )
          return { singleId, recurringId, movedId }
        }),
        async ({ page, step, check }, { token, data }) => {
          await routeApiReference(page)
          const titles = () => listGoogleEvents(request, HAYASHI.calendarId)
          try {
            await step(
              `${HAYASHI.name} に Google カレンダーを結び付け、「${single}」、毎週月曜の「${weekly}」、${fromNextMonday(14)} の回を置き換えた「${moved}」を作った。書き出しを待つ`,
            )
            await expect
              .poll(
                async () =>
                  (await titles()).filter((e) => [single, weekly, moved].includes(e.summary ?? ''))
                    .length,
              )
              .toBe(3)
            await check('削除の前: calendarpit に 3 つの予定がある')

            await sendDelete(page, token, data.singleId, '204')
            await sendDeleteOccurrence(page, token, data.recurringId, fromNextMonday(7), '204')
            await sendDelete(page, token, data.movedId, '204')
            await check(
              `「${single}」、${fromNextMonday(7)} の回、「${moved}」を削除した。どれも 204 である`,
            )

            await expect
              .poll(async () =>
                (await titles()).some((e) => e.summary === single || e.summary === moved),
              )
              .toBe(false)
            await check(
              `calendarpit から「${single}」と「${moved}」が消えた（cancelled になり、一覧に出ない）`,
            )
            let exdate = ''
            await expect
              .poll(async () => {
                const event = (await titles()).find((e) => e.summary === weekly)
                exdate = event?.recurrence?.find((line) => line.startsWith('EXDATE')) ?? ''
                return exdate
              })
              .toContain(fromNextMonday(7).replaceAll('-', ''))
            expect(exdate).toContain(fromNextMonday(14).replaceAll('-', ''))
            await check(
              `calendarpit の「${weekly}」の EXDATE が「${exdate}」で、削除した回と置き換えた回の日がある`,
            )
          } finally {
            await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
            await unlinkStaffCalendar(page, HAYASHI.id)
          }
        },
      )
    })

    test(`${prefix}1-7 回のキャンセル`, async ({ browser }) => {
      const title = `キャンセルする定例 ${Date.now()}`
      const target = fromNextMonday(7)
      await recordPrEvidence(
        browser,
        { name: '1-7', title: '回のキャンセル', actor, variant },
        prepare(async (page, token) => ({
          recurringId: await id(
            await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: HAYASHI.id,
              title,
              date: fromNextMonday(0),
            }),
          ),
          okada: await issueAccessToken(page.request, OKADA.email),
        })),
        async ({ page, step, check }, { token, data }) => {
          await routeApiReference(page)
          await step(
            `API で毎週月曜の「${title}」を作った。API の参照のページで、${target} の回のキャンセル（cancelOccurrence）を送る`,
          )
          const cancel = async (who: string, recurringId: string, status: string) => {
            await openApiClient(page, 'schedule', {
              tag: 'schedule',
              method: 'post',
              path: '/v1/schedules/recurring/{recurring_schedule_id}/occurrences/cancel',
            })
            await fillApiToken(page, who)
            await fillApiVariable(page, 'recurring_schedule_id', recurringId)
            await fillApiBody(page, { original_date: target, reason: '利用者の入院' })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText(status)
          }
          await cancel(token, data.recurringId, '201')
          await check('回のキャンセルの応答は 201 である')
          await checkDay(page, check, target, title, true, 'キャンセルの後（キャンセルした回）')
          await step(`google_primary の事業所の ${OKADA.staff.name} のトークンで、回のキャンセルを送る`)
          await cancel(data.okada, MISSING_ID, '409')
          await expect(apiClient(page).dialog).toContainText('"code": "google_primary"')
          await check('google_primary の事業所の回のキャンセルは 409（google_primary）である')
        },
      )
    })
  }
})
