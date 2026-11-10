import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
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
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
} from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { createWeeklyNormalSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。日曜に始まる週の月曜から数える。 */
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

/** 開いている date の日の表示の staffId の列に、title の予定が出るか（shown）を、判定の字幕で確認する。 */
const checkShown = (
  page: Page,
  staffId: string,
  date: string,
  title: string,
  shown: boolean,
  weekday: string,
) =>
  check(page, `${date}（${weekday}）に「${title}」が${shown ? '出る' : '出ない'}`, () => {
    const event = dayEvent(page, staffId, title)
    return shown ? expect(event).toBeVisible() : expect(event).toBeHidden()
  })

/** date の日の表示を開き、staffId の列に title の予定が出るか（shown）を、判定の字幕で確認する。 */
const checkDay = async (
  page: Page,
  staffId: string,
  date: string,
  title: string,
  shown: boolean,
  weekday: string,
) => {
  await step(page, `${date}（${weekday}）の日の表示を開く`, () => openDay(page, staffId, date))
  await checkShown(page, staffId, date, title, shown, weekday)
}

type ListedSchedules = {
  schedules: { title: string | null; review_reason: string | null }[]
  recurring_schedules: {
    id: string
    title: string | null
    recurring_rule: { days_of_week?: number[] | null; interval?: number | null }
  }[]
}

/** 予定の一覧（listSchedules）で、facilityId の事業所の from から to までの予定を読む。 */
const listSchedules = async (
  request: APIRequestContext,
  token: string,
  facilityId: string,
  from: string,
  to: string,
) => {
  const res = await request.get(`${SCHEDULE_URL}/v1/facilities/${facilityId}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { date_from: from, date_to: to },
  })
  expect(res.ok()).toBe(true)
  return (await res.json()) as ListedSchedules
}

/**
 * calendarpit の Calendar API（events.list の singleEvents）が返す、calendarId の title の予定の回の日付（YYYY-MM-DD）。
 * from の 0 時から to の 0 時（Asia/Tokyo）までの回を読む。
 */
const googleInstanceDates = async (
  request: APIRequestContext,
  calendarId: string,
  title: string,
  from: string,
  to: string,
) => {
  const res = await request.get(
    `${CALENDARPIT_URL}/__calendarpit/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      params: {
        singleEvents: true,
        maxResults: 2500,
        timeMin: `${from}T00:00:00+09:00`,
        timeMax: `${to}T00:00:00+09:00`,
      },
    },
  )
  expect(res.ok()).toBe(true)
  const { items = [] } = (await res.json()) as {
    items?: { summary?: string; start?: { dateTime?: string } }[]
  }
  return items
    .filter((item) => item.summary === title)
    .map((item) => item.start?.dateTime?.slice(0, 10) ?? '')
    .sort()
}

/** 移行の前と後で同じ繰り返しの予定を見るための、固定のタイトル。 */
const MIGRATION_TITLE = '移行の確認の定例'

/** 録画の外で、青木 陽菜のトークンで、林の start からの rule の毎週の通常の予定を予定の API で作り、返った規則を確認する。 */
const prepareHayashiWeekly = (
  browser: Parameters<typeof prepareOutsideRecording>[0],
  title: string,
  start: string,
  rule: { days_of_week?: number[]; interval?: number },
  expected: { days_of_week: number[]; interval: number },
) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
    const token = await issueAccessToken(page.request, LOGIN_EMAIL)
    const created = await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
      staffId: HAYASHI.id,
      title,
      date: start,
      rule,
    })
    expect(created.status()).toBe(201)
    const body = (await created.json()) as ListedSchedules['recurring_schedules'][number]
    expect(body.recurring_rule.days_of_week).toEqual(expected.days_of_week)
    expect(body.recurring_rule.interval).toBe(expected.interval)
  })

test.describe('予定の API', () => {
  test.describe(`繰り返しの予定の毎週の曜日と間隔（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('recurring-weekly-days buddy を正本にする事業所で、毎週の月曜と木曜の繰り返しの予定を API で作った場合、予定の表示に月曜と木曜の両方の回が出ること', async ({
      browser,
      context,
    }) => {
      const title = `週 2 回の定例 ${Date.now()}`
      const monday = fromNextMonday(0)
      await prepareHayashiWeekly(
        browser,
        title,
        monday,
        { days_of_week: [1, 4] },
        { days_of_week: [1, 4], interval: 1 },
      )

      const page = await context.newPage()
      await openDay(page, HAYASHI.id, monday)
      await intro(
        page,
        `buddy を正本にする事業所で、毎週の月曜と木曜の繰り返しの予定を作ると、月曜と木曜の両方に回が出る\n前提 予定の API（createRecurringSchedule）で、${HAYASHI.name} の ${monday} から「days_of_week: [1, 4]」の「${title}」を作った。201 が返り、規則は days_of_week [1, 4]、interval 1 だった。${monday}（月曜）の日の表示を開いている`,
      )
      await checkShown(page, HAYASHI.id, monday, title, true, '月曜')
      await checkDay(page, HAYASHI.id, fromNextMonday(2), title, false, '水曜')
      await checkDay(page, HAYASHI.id, fromNextMonday(3), title, true, '木曜')
      await checkDay(page, HAYASHI.id, fromNextMonday(7), title, true, '次の週の月曜')
    })

    test('recurring-weekly-interval buddy を正本にする事業所で、隔週の火曜の繰り返しの予定を API で作った場合、最初の日付の週から 2 週ごとの火曜に回が出て、間の週に出ないこと', async ({
      browser,
      context,
    }) => {
      const title = `隔週の定例 ${Date.now()}`
      const tuesday = fromNextMonday(1)
      await prepareHayashiWeekly(
        browser,
        title,
        tuesday,
        { interval: 2 },
        { days_of_week: [2], interval: 2 },
      )

      const page = await context.newPage()
      await openDay(page, HAYASHI.id, tuesday)
      await intro(
        page,
        `buddy を正本にする事業所で、隔週の火曜の繰り返しの予定を作ると、2 週ごとの火曜に回が出て、間の週に出ない\n前提 予定の API（createRecurringSchedule）で、${HAYASHI.name} の ${tuesday}（火曜）から「interval: 2」の「${title}」を作った。201 が返り、規則は days_of_week [2]、interval 2 だった。${tuesday} の日の表示を開いている`,
      )
      await checkShown(page, HAYASHI.id, tuesday, title, true, '1 週目の火曜')
      await checkDay(page, HAYASHI.id, fromNextMonday(8), title, false, '2 週目の火曜')
      await checkDay(page, HAYASHI.id, fromNextMonday(15), title, true, '3 週目の火曜')
      await checkDay(page, HAYASHI.id, fromNextMonday(22), title, false, '4 週目の火曜')
    })
  })

  test.describe(`繰り返しの予定の毎週の曜日と間隔（${OKADA.staff.name}、Google カレンダーを正本にする事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('recurring-weekly-google-primary Google カレンダーを正本にする事業所で、Google カレンダーに隔週の火曜と、毎週の月曜と木曜の繰り返しの予定がある場合、どちらも確認が必要な予定にならず、回ごとに出ること', async ({
      browser,
      context,
      request,
    }) => {
      const stamp = Date.now()
      const biweekly = `隔週の定例 ${stamp}`
      const twice = `週 2 回の定例 ${stamp}`
      const token = await prepareOutsideRecording(
        browser,
        { storageState: OKADA_STATE },
        async (page) => {
          await createGoogleEvent(page.request, OKADA.calendarId, {
            summary: biweekly,
            date: fromNextMonday(1),
            start: '10:00',
            end: '11:00',
            recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'],
          })
          await createGoogleEvent(page.request, OKADA.calendarId, {
            summary: twice,
            date: fromNextMonday(0),
            start: '14:00',
            end: '15:00',
            recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TH'],
          })
          return issueAccessToken(page.request, OKADA.email)
        },
      )

      const page = await context.newPage()
      try {
        await openDay(page, OKADA.staff.id, fromNextMonday(0))
        await intro(
          page,
          `Google カレンダーを正本にする事業所で、隔週の火曜と、毎週の月曜と木曜の Google の繰り返しの予定が、確認が必要な予定にならずに回ごとに出る\n前提 calendarpit の ${OKADA.calendarId} に、「${biweekly}」（FREQ=WEEKLY;INTERVAL=2;BYDAY=TU）と「${twice}」（FREQ=WEEKLY;BYDAY=MO,TH）を作った`,
        )
        await check(
          page,
          `（同期が読むまで待つ）予定の一覧（listSchedules）の ${fromNextMonday(0)} から 3 週に、「${biweekly}」の回が 2 件、「${twice}」の回が 6 件出て、どれも review_reason が null である`,
          async () => {
            // 同期は別の処理が読むので、一覧に出るまで読み直す
            await expect(async () => {
              const listed = await listSchedules(
                page.request,
                token,
                OKADA.facilityId,
                fromNextMonday(0),
                fromNextMonday(20),
              )
              const reasons = (title: string) =>
                listed.schedules.filter((s) => s.title === title).map((s) => s.review_reason)
              expect(reasons(biweekly)).toEqual([null, null])
              expect(reasons(twice)).toEqual([null, null, null, null, null, null])
            }).toPass()
          },
        )
        await checkDay(page, OKADA.staff.id, fromNextMonday(1), biweekly, true, '1 週目の火曜')
        await checkDay(page, OKADA.staff.id, fromNextMonday(8), biweekly, false, '2 週目の火曜')
        await checkDay(page, OKADA.staff.id, fromNextMonday(15), biweekly, true, '3 週目の火曜')
        await checkDay(page, OKADA.staff.id, fromNextMonday(7), twice, true, '月曜')
        await checkDay(page, OKADA.staff.id, fromNextMonday(10), twice, true, '木曜')
      } finally {
        for (const event of await listGoogleEvents(request, OKADA.calendarId)) {
          if (event.summary === biweekly || event.summary === twice)
            await deleteGoogleEvent(request, OKADA.calendarId, event.id)
        }
      }
    })
  })

  test.describe(`繰り返しの予定の毎週の曜日と間隔（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('recurring-weekly-export buddy を正本にする事業所で、隔週の月曜と木曜の繰り返しの予定を書き出した場合、Google カレンダーの回が buddy の予定の表示の回と同じ日に出ること', async ({
      browser,
      context,
      request,
    }) => {
      const title = `隔週の訪問 ${Date.now()}`
      await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
        await linkStaffCalendar(page, HAYASHI.id)
        const token = await issueAccessToken(page.request, LOGIN_EMAIL)
        const created = await createWeeklyNormalSchedule(
          page.request,
          token,
          STAFF_FORM.facilityId,
          {
            staffId: HAYASHI.id,
            title,
            date: fromNextMonday(0),
            rule: { days_of_week: [1, 4], interval: 2 },
          },
        )
        expect(created.status()).toBe(201)
      })

      const page = await context.newPage()
      try {
        await openDay(page, HAYASHI.id, fromNextMonday(0))
        await intro(
          page,
          `buddy を正本にする事業所で、隔週の月曜と木曜の繰り返しの予定を書き出すと、calendarpit の回が buddy の回と同じ日に出る\n前提 ${HAYASHI.name} に Google カレンダーを結び付け、${fromNextMonday(0)} から隔週の月曜と木曜の「${title}」を API で作った`,
        )
        let rrule = ''
        await step(page, '（撮影のため、calendarpit に書き出されるまで待つ）', async () => {
          await expect
            .poll(async () => {
              const event = (await listGoogleEvents(request, HAYASHI.calendarId)).find(
                (e) => e.summary === title,
              )
              rrule = event?.recurrence?.find((line) => line.startsWith('RRULE:')) ?? ''
              return rrule
            })
            .toContain('INTERVAL=2;BYDAY=MO,TH;WKST=SU')
        })
        await check(page, `calendarpit の親の予定の RRULE が「${rrule}」になる`, async () => {
          expect(rrule).toContain('INTERVAL=2;BYDAY=MO,TH;WKST=SU')
        })
        // calendarpit の管理の画面の日の表示は、曜日が複数の隔週の回を出さないので、Calendar API の回（singleEvents）を読む
        const instances = await googleInstanceDates(
          request,
          HAYASHI.calendarId,
          title,
          fromNextMonday(0),
          fromNextMonday(21),
        )
        await check(
          page,
          `calendarpit が Calendar API で返す回の日は ${instances.join('、')} である`,
          async () => {
            expect(instances.length).toBeGreaterThan(0)
          },
        )

        const dates: [number, boolean, string][] = [
          [3, true, '1 週目の木曜'],
          [7, false, '2 週目の月曜'],
          [10, false, '2 週目の木曜'],
          [14, true, '3 週目の月曜'],
          [17, true, '3 週目の木曜'],
        ]
        for (const [days, shown, weekday] of dates) {
          const date = fromNextMonday(days)
          await checkDay(page, HAYASHI.id, date, title, shown, weekday)
          await check(
            page,
            `calendarpit の回にも ${date}（${weekday}）が${shown ? 'ある' : '無い'}`,
            async () => {
              expect(instances.includes(date)).toBe(shown)
            },
          )
        }
      } finally {
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, HAYASHI.id),
        )
      }
    })

    test('recurring-weekly-migration マイグレーションの前に作った毎週の繰り返しの予定がある場合、マイグレーションの後も回が同じ日に出ること', async ({
      browser,
      context,
    }) => {
      const monday = fromNextMonday(0)
      await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
        const token = await issueAccessToken(page.request, LOGIN_EMAIL)
        const listed = await listSchedules(
          page.request,
          token,
          STAFF_FORM.facilityId,
          monday,
          monday,
        )
        if (!listed.recurring_schedules.some((rs) => rs.title === MIGRATION_TITLE)) {
          // 改修前の compose で 1 度だけ作り、改修後は同じ DB の行を読む
          const created = await createWeeklyNormalSchedule(
            page.request,
            token,
            STAFF_FORM.facilityId,
            {
              staffId: HAYASHI.id,
              title: MIGRATION_TITLE,
              date: monday,
            },
          )
          expect(created.status()).toBe(201)
        }
      })

      const page = await context.newPage()
      await openDay(page, HAYASHI.id, fromNextMonday(7))
      await intro(
        page,
        `マイグレーションの前に作った毎週月曜の繰り返しの予定の回が、マイグレーションの後も同じ日に出る\n前提 改修前の版で、${HAYASHI.name} の ${monday}（月曜）から曜日を省いた毎週の「${MIGRATION_TITLE}」を作り、同じ DB で改修後の版を起動した。${fromNextMonday(7)}（月曜）の日の表示を開いている`,
      )
      await checkShown(page, HAYASHI.id, fromNextMonday(7), MIGRATION_TITLE, true, '月曜')
      await checkDay(page, HAYASHI.id, fromNextMonday(8), MIGRATION_TITLE, false, '火曜')
      await checkDay(page, HAYASHI.id, fromNextMonday(14), MIGRATION_TITLE, true, '次の週の月曜')
    })
  })
})
