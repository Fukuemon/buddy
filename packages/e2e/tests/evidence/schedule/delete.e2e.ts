import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  HAYASHI,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  OKADA,
  SCHEDULE_URL,
} from '../../fixtures/env'
import { listGoogleEvents } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import {
  createNormalSchedule,
  createWeeklyNormalSchedule,
  getSchedule,
  replaceOccurrence,
} from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { openApiClient } from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'

type Browser = Parameters<typeof prepareOutsideRecording>[0]

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/**
 * 録画の外で、青木 陽菜のログインの状態で青木 陽菜のトークンを取り、setup で前提のデータを作る。
 * トークンと、setup の戻り値を返す。
 */
const prepare = <T>(browser: Browser, setup: (page: Page, token: string) => Promise<T>) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
    const token = await issueAccessToken(page.request, LOGIN_EMAIL)
    return { token, data: await setup(page, token) }
  })

/** ログインしていない録画の外のコンテキストで、google_primary の事業所の岡田 葵のトークンを取る。 */
const okadaToken = (browser: Browser) =>
  prepareOutsideRecording(browser, {}, (page) => issueAccessToken(page.request, OKADA.email))

const id = async (res: Awaited<ReturnType<APIRequestContext['post']>>) => {
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** 前の送信のクライアントを、ページを開き直して閉じる。開いたままだと、次の操作のボタンを押せない。 */
const closeApiClient = async (page: Page) => {
  await page.goto('about:blank')
}

/** API の参照のページで、予定 scheduleId の削除（deleteSchedule）を送り、応答に status が出るのを待つ。 */
const sendDelete = async (page: Page, token: string, scheduleId: string, status: string) => {
  await closeApiClient(page)
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
  await closeApiClient(page)
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

/** 「キャンセルした予定を出す」を入れた date の日の表示を開き、林 さくらの列が出るまで待つ。 */
const openCancelledDay = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}&cancelled=true`)
  await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
}

/**
 * 「キャンセルした予定を出す」を入れた日の表示で、林 さくらの列に title の予定が出るか（shown）を判定の字幕で確かめる。
 * opened が true なら、その日の表示を開いたまま判定する。
 */
const checkDay = async (
  page: Page,
  date: string,
  title: string,
  shown: boolean,
  label: string,
  { opened = false } = {},
) => {
  if (!opened)
    await step(page, `「キャンセルした予定を出す」を入れた ${date} の日の表示を開く`, () =>
      openCancelledDay(page, date),
    )
  const event = page
    .getByTestId(`day-grid-staff-${HAYASHI.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })
  await check(
    page,
    `${label}: 「キャンセルした予定を出す」を入れた ${date} の日の表示に「${title}」が${shown ? '出る' : '出ない'}`,
    async () => {
      if (shown) await expect(event.first()).toBeVisible()
      else await expect(event).toHaveCount(0)
    },
  )
}

/**
 * google_primary の事業所の職員が送る、buddy の予定のテーブルに無い ID。
 * ほかの事業所の予定の ID を送ると、認証のミドルウェアが事業所の違いで 403 にするので、どの事業所にも無い ID にする。
 */
const MISSING_ID = '01M3TCZZZZZZZZZZZZZZZZZZZZ'

test.describe('予定の API の予定の削除', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、API の参照のページ）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('1-1 単発の予定の削除', async ({ browser, context }) => {
      const title = `誤入力の予定 ${Date.now()}`
      const date = daysFromToday(1)
      const { token, data: scheduleId } = await prepare(browser, async (page, token) =>
        id(
          await createNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
            staffId: HAYASHI.id,
            title,
            date,
          }),
        ),
      )

      const page = await context.newPage()
      await routeApiReference(page)
      await openCancelledDay(page, date)
      await intro(
        page,
        `単発の予定の削除\n前提 API で ${HAYASHI.name} の ${date} に「${title}」を作った`,
      )

      await checkDay(page, date, title, true, '削除の前', { opened: true })
      await step(page, 'API の参照のページで、予定の削除（deleteSchedule）を送る', () =>
        sendDelete(page, token, scheduleId, '204'),
      )
      await check(page, '予定の削除の応答は 204 である', () =>
        expect(apiClient(page).dialog).toContainText('204'),
      )
      await checkDay(page, date, title, false, '削除の後')
      await check(page, '削除した予定の取得（getSchedule）は 404 を返す', async () => {
        const res = await getSchedule(page.request, token, scheduleId)
        expect(res.status()).toBe(404)
      })
    })

    test('1-2 繰り返しの予定の回の削除', async ({ browser, context }) => {
      const title = `誤入力の定例 ${Date.now()}`
      const target = fromNextMonday(7)
      const { token, data: recurringId } = await prepare(browser, async (page, token) =>
        id(
          await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
            staffId: HAYASHI.id,
            title,
            date: fromNextMonday(0),
          }),
        ),
      )

      const page = await context.newPage()
      await routeApiReference(page)
      await openCancelledDay(page, target)
      await intro(
        page,
        `繰り返しの予定の回の削除\n前提 API で ${HAYASHI.name} の ${fromNextMonday(0)} から毎週月曜の「${title}」を作った`,
      )

      await checkDay(page, target, title, true, '削除の前', { opened: true })
      await step(page, `API の参照のページで、${target} の回の削除（deleteOccurrence）を送る`, () =>
        sendDeleteOccurrence(page, token, recurringId, target, '204'),
      )
      await check(page, '回の削除の応答は 204 である', () =>
        expect(apiClient(page).dialog).toContainText('204'),
      )
      await checkDay(page, target, title, false, '削除の後')
      await checkDay(page, fromNextMonday(14), title, true, '次の週の回')
    })

    test('1-3 置き換えた回の削除', async ({ browser, context }) => {
      const title = `誤入力の定例 ${Date.now()}`
      const moved = `置き換えた回 ${Date.now()}`
      const target = fromNextMonday(7)
      const { token, data: replacedId } = await prepare(browser, async (page, token) => {
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
      })

      const page = await context.newPage()
      await routeApiReference(page)
      await openCancelledDay(page, target)
      await intro(
        page,
        `置き換えた回の削除\n前提 API で毎週月曜の「${title}」を作り、${target} の回を「${moved}」に置き換えた`,
      )

      await checkDay(page, target, moved, true, '削除の前', { opened: true })
      await step(page, 'API の参照のページで、置き換えた予定の削除（deleteSchedule）を送る', () =>
        sendDelete(page, token, replacedId, '204'),
      )
      await check(page, '置き換えた予定の削除の応答は 204 である', () =>
        expect(apiClient(page).dialog).toContainText('204'),
      )
      await checkDay(page, target, moved, false, '削除の後（置き換えた予定）')
      await checkDay(page, target, title, false, '削除の後（元の回）', { opened: true })
      await checkDay(page, fromNextMonday(14), title, true, '次の週の回')
    })

    test('1-4 単発の予定の削除を拒む', async ({ browser, context }) => {
      const past = `昨日の予定 ${Date.now()}`
      const cancelled = `キャンセルした予定 ${Date.now()}`
      const yesterday = daysFromToday(-1)
      const tomorrow = daysFromToday(1)
      const { token, data } = await prepare(browser, async (page, token) => {
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
        const res = await page.request.post(`${SCHEDULE_URL}/v1/schedules/${cancelledId}/cancel`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { reason: '利用者の都合' },
        })
        expect(res.status()).toBe(201)
        return { pastId, cancelledId }
      })
      const okada = await okadaToken(browser)

      const page = await context.newPage()
      await routeApiReference(page)
      await openCancelledDay(page, yesterday)
      await intro(
        page,
        `単発の予定の削除を拒む\n前提 API で ${yesterday} の「${past}」と、${tomorrow} の「${cancelled}」を作り、後者をキャンセルした`,
      )

      await step(
        page,
        `API の参照のページで、昨日の「${past}」の削除（deleteSchedule）を送る`,
        () => sendDelete(page, token, data.pastId, '400'),
      )
      await check(
        page,
        '昨日の予定の削除は 400（invalid_input）で、「今日より前の予定は削除できません」',
        () => expect(apiClient(page).dialog).toContainText('今日より前の予定は削除できません'),
      )
      await checkDay(page, yesterday, past, true, '拒んだ後')
      await step(page, `キャンセルした「${cancelled}」の削除（deleteSchedule）を送る`, () =>
        sendDelete(page, token, data.cancelledId, '409'),
      )
      await check(
        page,
        'キャンセル済みの予定の削除は 409（conflict）で、「キャンセル済みの予定は削除できません」',
        () => expect(apiClient(page).dialog).toContainText('"code": "conflict"'),
      )
      await checkDay(page, tomorrow, cancelled, true, '拒んだ後')
      await step(
        page,
        `google_primary の事業所の ${OKADA.staff.name} のトークンで、予定の削除を送る`,
        () => sendDelete(page, okada, MISSING_ID, '409'),
      )
      await check(page, 'google_primary の事業所の予定の削除は 409（google_primary）である', () =>
        expect(apiClient(page).dialog).toContainText('"code": "google_primary"'),
      )
    })

    test('1-5 回の削除を拒む', async ({ browser, context }) => {
      const title = `拒む定例 ${Date.now()}`
      const { token, data: recurringId } = await prepare(browser, async (page, token) => {
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
        return recurringId
      })
      const okada = await okadaToken(browser)

      const page = await context.newPage()
      await routeApiReference(page)
      await openCancelledDay(page, daysFromToday(-1))
      await intro(
        page,
        `回の削除を拒む\n前提 API で ${daysFromToday(-1)} から毎週の「${title}」を作り、${daysFromToday(6)} の回を削除し、${daysFromToday(13)} の回をキャンセルした`,
      )

      const cases: [string, string, string][] = [
        [daysFromToday(1), '400', '回に当たらない日（明日）'],
        [daysFromToday(-1), '400', '昨日の回'],
        [daysFromToday(6), '409', '削除した回'],
        [daysFromToday(13), '409', 'キャンセルした回'],
      ]
      for (const [date, status, label] of cases) {
        await step(page, `${label}（${date}）の回の削除（deleteOccurrence）を送る`, () =>
          sendDeleteOccurrence(page, token, recurringId, date, status),
        )
        await check(page, `${label}（${date}）の回の削除は ${status} である`, () =>
          expect(apiClient(page).dialog).toContainText(status),
        )
      }
      await step(
        page,
        `google_primary の事業所の ${OKADA.staff.name} のトークンで、回の削除を送る`,
        () => sendDeleteOccurrence(page, okada, MISSING_ID, daysFromToday(20), '409'),
      )
      await check(page, 'google_primary の事業所の回の削除は 409（google_primary）である', () =>
        expect(apiClient(page).dialog).toContainText('"code": "google_primary"'),
      )
    })

    test('1-6 Google カレンダーへの削除の書き出し', async ({ browser, context, request }) => {
      const single = `書き出した予定 ${Date.now()}`
      const weekly = `書き出した定例 ${Date.now()}`
      const moved = `書き出した置き換え ${Date.now()}`
      const titles = () => listGoogleEvents(request, HAYASHI.calendarId)
      const exported = async () =>
        (await titles()).filter((e) => [single, weekly, moved].includes(e.summary ?? '')).length
      // 録画する page は前準備の後に開く。前準備で失敗したときは、結び付けを外すためだけに開く
      let recorded: Page | undefined
      try {
        const { token, data } = await prepare(browser, async (page, token) => {
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
          // 書き出しは別の処理が行うので、3 つの予定が calendarpit に届くまで待つ
          await expect.poll(exported).toBe(3)
          return { singleId, recurringId, movedId }
        })

        const page = await context.newPage()
        recorded = page
        await routeApiReference(page)
        await openCancelledDay(page, daysFromToday(1))
        await intro(
          page,
          `Google カレンダーへの削除の書き出し\n前提 ${HAYASHI.name} に Google カレンダーを結び付け、「${single}」、毎週月曜の「${weekly}」、${fromNextMonday(14)} の回を置き換えた「${moved}」を作り、書き出しを待った`,
        )

        await check(page, '削除の前: calendarpit に 3 つの予定がある', () =>
          expect.poll(exported).toBe(3),
        )

        await step(
          page,
          `API の参照のページで、「${single}」、${fromNextMonday(7)} の回、「${moved}」の削除を送る`,
          async () => {
            await sendDelete(page, token, data.singleId, '204')
            await sendDeleteOccurrence(page, token, data.recurringId, fromNextMonday(7), '204')
            await sendDelete(page, token, data.movedId, '204')
          },
        )
        await check(
          page,
          `「${single}」、${fromNextMonday(7)} の回、「${moved}」を削除した。どれも 204 である`,
          () => expect(apiClient(page).dialog).toContainText('204'),
        )

        await check(
          page,
          `calendarpit から「${single}」と「${moved}」が消えた（cancelled になり、一覧に出ない）`,
          () =>
            expect
              .poll(async () =>
                (await titles()).some((e) => e.summary === single || e.summary === moved),
              )
              .toBe(false),
        )
        let exdate = ''
        await expect
          .poll(async () => {
            const event = (await titles()).find((e) => e.summary === weekly)
            exdate = event?.recurrence?.find((line) => line.startsWith('EXDATE')) ?? ''
            return exdate
          })
          .toContain(fromNextMonday(7).replaceAll('-', ''))
        await check(
          page,
          `calendarpit の「${weekly}」の EXDATE が「${exdate}」で、削除した回と置き換えた回の日がある`,
          async () => {
            expect(exdate).toContain(fromNextMonday(7).replaceAll('-', ''))
            expect(exdate).toContain(fromNextMonday(14).replaceAll('-', ''))
          },
        )
      } finally {
        const opened = recorded ?? (await context.newPage())
        await step(opened, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(opened, HAYASHI.id),
        )
      }
    })

    test('1-7 回のキャンセル', async ({ browser, context }) => {
      const title = `キャンセルする定例 ${Date.now()}`
      const target = fromNextMonday(7)
      const { token, data: recurringId } = await prepare(browser, async (page, token) =>
        id(
          await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
            staffId: HAYASHI.id,
            title,
            date: fromNextMonday(0),
          }),
        ),
      )
      const okada = await okadaToken(browser)

      const page = await context.newPage()
      await routeApiReference(page)
      await openCancelledDay(page, target)
      await intro(page, `回のキャンセル\n前提 API で毎週月曜の「${title}」を作った`)

      const cancel = async (who: string, id: string, status: string) => {
        await closeApiClient(page)
        await openApiClient(page, 'schedule', {
          tag: 'schedule',
          method: 'post',
          path: '/v1/schedules/recurring/{recurring_schedule_id}/occurrences/cancel',
        })
        await fillApiToken(page, who)
        await fillApiVariable(page, 'recurring_schedule_id', id)
        await fillApiBody(page, { original_date: target, reason: '利用者の入院' })
        await apiClient(page).send.click()
        await expect(apiClient(page).dialog).toContainText(status)
      }
      await step(
        page,
        `API の参照のページで、${target} の回のキャンセル（cancelOccurrence）を送る`,
        () => cancel(token, recurringId, '201'),
      )
      await check(page, '回のキャンセルの応答は 201 である', () =>
        expect(apiClient(page).dialog).toContainText('201'),
      )
      await checkDay(page, target, title, true, 'キャンセルの後（キャンセルした回）')
      await step(
        page,
        `google_primary の事業所の ${OKADA.staff.name} のトークンで、回のキャンセルを送る`,
        () => cancel(okada, MISSING_ID, '409'),
      )
      await check(
        page,
        'google_primary の事業所の回のキャンセルは 409（google_primary）である',
        () => expect(apiClient(page).dialog).toContainText('"code": "google_primary"'),
      )
    })
  })
})
