import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import {
  CALENDARPIT_URL,
  HAYASHI,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  OKADA,
  SCHEDULE_URL,
} from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
} from '../../fixtures/googleCalendar'
import { createWeeklyNormalSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'

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

/** date の日の表示を開き、staffId の列に title の予定が出るか（shown）を確認して、check に結果の文を渡す。 */
const checkDay = async (
  page: Page,
  check: (text: string) => Promise<void>,
  staffId: string,
  date: string,
  title: string,
  shown: boolean,
  weekday: string,
) => {
  await openDay(page, staffId, date)
  const event = dayEvent(page, staffId, title)
  if (shown) await expect(event).toBeVisible()
  else await expect(event).toBeHidden()
  await check(`${date}（${weekday}）に「${title}」が${shown ? '出る' : '出ない'}`)
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

test.describe('予定の API', () => {
  test.describe('繰り返しの予定の毎週の曜日と間隔', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}buddy を正本にする事業所で、毎週の月曜と木曜の繰り返しの予定を API で作った場合、予定の表示に月曜と木曜の両方の回が出ること`, async ({
        browser,
      }) => {
        const title = `週 2 回の定例 ${Date.now()}`
        const monday = fromNextMonday(0)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-weekly-days',
            title:
              'buddy を正本にする事業所で、毎週の月曜と木曜の繰り返しの予定を作ると、月曜と木曜の両方に回が出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
            const token = await issueAccessToken(page.request, LOGIN_EMAIL)
            const created = await createWeeklyNormalSchedule(
              page.request,
              token,
              STAFF_FORM.facilityId,
              {
                staffId: HAYASHI.id,
                title,
                date: monday,
                rule: { days_of_week: [1, 4] },
              },
            )
            expect(created.status()).toBe(201)
            const body = (await created.json()) as ListedSchedules['recurring_schedules'][number]
            expect(body.recurring_rule.days_of_week).toEqual([1, 4])
            expect(body.recurring_rule.interval).toBe(1)
          },
          async ({ page, step, check }) => {
            await step(
              `予定の API（createRecurringSchedule）で、${HAYASHI.name} の ${monday} から「days_of_week: [1, 4]」の「${title}」を作った。201 が返り、規則は days_of_week [1, 4]、interval 1 だった`,
            )
            await checkDay(page, check, HAYASHI.id, monday, title, true, '月曜')
            await checkDay(page, check, HAYASHI.id, fromNextMonday(2), title, false, '水曜')
            await checkDay(page, check, HAYASHI.id, fromNextMonday(3), title, true, '木曜')
            await checkDay(page, check, HAYASHI.id, fromNextMonday(7), title, true, '次の週の月曜')
          },
        )
      })

      test(`${prefix}buddy を正本にする事業所で、隔週の火曜の繰り返しの予定を API で作った場合、最初の日付の週から 2 週ごとの火曜に回が出て、間の週に出ないこと`, async ({
        browser,
      }) => {
        const title = `隔週の定例 ${Date.now()}`
        const tuesday = fromNextMonday(1)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-weekly-interval',
            title:
              'buddy を正本にする事業所で、隔週の火曜の繰り返しの予定を作ると、2 週ごとの火曜に回が出て、間の週に出ない',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
            const token = await issueAccessToken(page.request, LOGIN_EMAIL)
            const created = await createWeeklyNormalSchedule(
              page.request,
              token,
              STAFF_FORM.facilityId,
              {
                staffId: HAYASHI.id,
                title,
                date: tuesday,
                rule: { interval: 2 },
              },
            )
            expect(created.status()).toBe(201)
            const body = (await created.json()) as ListedSchedules['recurring_schedules'][number]
            expect(body.recurring_rule.days_of_week).toEqual([2])
            expect(body.recurring_rule.interval).toBe(2)
          },
          async ({ page, step, check }) => {
            await step(
              `予定の API（createRecurringSchedule）で、${HAYASHI.name} の ${tuesday}（火曜）から「interval: 2」の「${title}」を作った。201 が返り、規則は days_of_week [2]、interval 2 だった`,
            )
            await checkDay(page, check, HAYASHI.id, tuesday, title, true, '1 週目の火曜')
            await checkDay(page, check, HAYASHI.id, fromNextMonday(8), title, false, '2 週目の火曜')
            await checkDay(page, check, HAYASHI.id, fromNextMonday(15), title, true, '3 週目の火曜')
            await checkDay(
              page,
              check,
              HAYASHI.id,
              fromNextMonday(22),
              title,
              false,
              '4 週目の火曜',
            )
          },
        )
      })

      test(`${prefix}Google カレンダーを正本にする事業所で、Google カレンダーに隔週の火曜と、毎週の月曜と木曜の繰り返しの予定がある場合、どちらも確認が必要な予定にならず、回ごとに出ること`, async ({
        browser,
        request,
      }) => {
        const stamp = Date.now()
        const biweekly = `隔週の定例 ${stamp}`
        const twice = `週 2 回の定例 ${stamp}`
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-weekly-google-primary',
            title:
              'Google カレンダーを正本にする事業所で、隔週の火曜と、毎週の月曜と木曜の Google の繰り返しの予定が、確認が必要な予定にならずに回ごとに出る',
            actor: `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OKADA.email)
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
            const token = await issueAccessToken(page.request, OKADA.email)
            return { token }
          },
          async ({ page, step, check }, { token }) => {
            try {
              await step(
                `calendarpit の ${OKADA.calendarId} に、「${biweekly}」（FREQ=WEEKLY;INTERVAL=2;BYDAY=TU）と「${twice}」（FREQ=WEEKLY;BYDAY=MO,TH）を作った。同期が読むまで待つ`,
              )
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
              await check(
                `予定の一覧（listSchedules）の ${fromNextMonday(0)} から 3 週に、「${biweekly}」の回が 2 件、「${twice}」の回が 6 件出て、どれも review_reason が null である`,
              )
              await checkDay(
                page,
                check,
                OKADA.staff.id,
                fromNextMonday(1),
                biweekly,
                true,
                '1 週目の火曜',
              )
              await checkDay(
                page,
                check,
                OKADA.staff.id,
                fromNextMonday(8),
                biweekly,
                false,
                '2 週目の火曜',
              )
              await checkDay(
                page,
                check,
                OKADA.staff.id,
                fromNextMonday(15),
                biweekly,
                true,
                '3 週目の火曜',
              )
              await checkDay(page, check, OKADA.staff.id, fromNextMonday(7), twice, true, '月曜')
              await checkDay(page, check, OKADA.staff.id, fromNextMonday(10), twice, true, '木曜')
            } finally {
              for (const event of await listGoogleEvents(request, OKADA.calendarId)) {
                if (event.summary === biweekly || event.summary === twice)
                  await deleteGoogleEvent(request, OKADA.calendarId, event.id)
              }
            }
          },
        )
      })

      test(`${prefix}buddy を正本にする事業所で、隔週の月曜と木曜の繰り返しの予定を書き出した場合、Google カレンダーの回が buddy の予定の表示の回と同じ日に出ること`, async ({
        browser,
        request,
      }) => {
        const title = `隔週の訪問 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-weekly-export',
            title:
              'buddy を正本にする事業所で、隔週の月曜と木曜の繰り返しの予定を書き出すと、calendarpit の回が buddy の回と同じ日に出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule/link')
            await signInAtBroker(page, LOGIN_EMAIL)
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
          },
          async ({ page, step, check }) => {
            try {
              await step(
                `${HAYASHI.name} に Google カレンダーを結び付け、${fromNextMonday(0)} から隔週の月曜と木曜の「${title}」を API で作った。書き出しを待つ`,
              )
              let rrule = ''
              await expect
                .poll(async () => {
                  const event = (await listGoogleEvents(request, HAYASHI.calendarId)).find(
                    (e) => e.summary === title,
                  )
                  rrule = event?.recurrence?.find((line) => line.startsWith('RRULE:')) ?? ''
                  return rrule
                })
                .toContain('INTERVAL=2;BYDAY=MO,TH;WKST=SU')
              await check(`calendarpit の親の予定の RRULE が「${rrule}」になる`)
              // calendarpit の管理の画面の日の表示は、曜日が複数の隔週の回を出さないので、Calendar API の回（singleEvents）を読む
              const instances = await googleInstanceDates(
                request,
                HAYASHI.calendarId,
                title,
                fromNextMonday(0),
                fromNextMonday(21),
              )
              await check(
                `calendarpit が Calendar API で返す回の日は ${instances.join('、')} である`,
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
                expect(instances.includes(date)).toBe(shown)
                await checkDay(page, check, HAYASHI.id, date, title, shown, weekday)
                await check(
                  `calendarpit の回にも ${date}（${weekday}）が${shown ? 'ある' : '無い'}`,
                )
              }
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, HAYASHI.id)
            }
          },
        )
      })

      test(`${prefix}マイグレーションの前に作った毎週の繰り返しの予定がある場合、マイグレーションの後も回が同じ日に出ること`, async ({
        browser,
      }) => {
        const monday = fromNextMonday(0)
        await recordPrEvidence(
          browser,
          {
            name: 'recurring-weekly-migration',
            title:
              'マイグレーションの前に作った毎週月曜の繰り返しの予定の回が、マイグレーションの後も同じ日に出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
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
          },
          async ({ page, step, check }) => {
            await step(
              `改修前の版で、${HAYASHI.name} の ${monday}（月曜）から曜日を省いた毎週の「${MIGRATION_TITLE}」を作り、同じ DB で改修後の版を起動した`,
            )
            await checkDay(
              page,
              check,
              HAYASHI.id,
              fromNextMonday(7),
              MIGRATION_TITLE,
              true,
              '月曜',
            )
            await checkDay(
              page,
              check,
              HAYASHI.id,
              fromNextMonday(8),
              MIGRATION_TITLE,
              false,
              '火曜',
            )
            await checkDay(
              page,
              check,
              HAYASHI.id,
              fromNextMonday(14),
              MIGRATION_TITLE,
              true,
              '次の週の月曜',
            )
          },
        )
      })
    }
  })
})
