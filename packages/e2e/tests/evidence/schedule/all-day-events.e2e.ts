import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { addDays, dayLabel, sundayOfWeek } from '../../fixtures/date'
import { LEADER, LOGIN_EMAIL, LOGIN_STAFF, OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import {
  createGoogleAllDayEvent,
  createGoogleEvent,
  deleteGoogleEvent,
} from '../../fixtures/googleCalendar'
import { createNormalSchedule, SCHEDULE_DETAIL_URL } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { openDay } from '../../screens/scheduleCalendar'
import { calendarAllDayRowLabel, calendarTimeLabel } from '../../selectors/scheduleCalendar'
import { wheel } from '../../widgets/scroll/actions/scroll'

const OKADA_ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`
const AOKI_ACTOR = `${LOGIN_STAFF.name}（buddy を正本にする事業所のマネージャー）`

/**
 * 予定のタイトルの後ろに付ける、今の時刻のミリ秒の下 3 桁。走らせるたびに違うタイトルにする。
 * 週の表示の列は狭く、長いタイトルは末尾が切れるので、時刻の全ての桁は付けない。
 */
const stamp = () => String(Date.now()).slice(-3)

/** EXDATE の行に書く、終日の回の日付（YYYYMMDD）。 */
const exDate = (date: string) => date.replaceAll('-', '')

const signInAsOkada = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, OKADA.email)
}

const openWeek = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=week&date=${date}`)
  await expect(calendarTimeLabel(page, '06:00:00')).toBeInViewport()
}

/** 予定のカレンダーの、タイトルが title の終日の予定のラベル。月と週の表示で使う。 */
const allDayLabel = (page: Page, title: string) =>
  page
    .getByTestId('schedule-calendar')
    .getByTestId(/^all-day-event-/)
    .filter({ hasText: title })

/** 同期が終日の予定を写すまで、週の表示を開き直す。 */
const waitAllDaySynced = async (page: Page, date: string, title: string) => {
  await openWeek(page, date)
  await expect(async () => {
    await page.reload()
    await expect(allDayLabel(page, title).first()).toBeVisible()
  }).toPass()
}

/** test で作った Google カレンダーの予定を消す。消した予定が、ほかの観点の表示に残らないようにする。 */
const deleteEvents = async (request: APIRequestContext, calendarId: string, ids: string[]) => {
  for (const id of ids) await deleteGoogleEvent(request, calendarId, id)
}

test.describe('予定のカレンダー', () => {
  test.describe('Google カレンダーの終日の予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const label = variant.label ? `${variant.label}: ` : ''

      test(`${label}Google カレンダーを正本にする事業所で表示している週に終日の予定がある場合、その日の「終日」の行に押せないラベルで出ること`, async ({
        browser,
        request,
      }) => {
        const sunday = sundayOfWeek(2)
        const allDayDate = addDays(sunday, 2)
        const timedDate = addDays(sunday, 4)
        const allDayTitle = `研修 ${stamp()}`
        const timedTitle = `担当者会議 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'all-day-week',
              title: '週の表示の終日の予定',
              actor: OKADA_ACTOR,
              variant,
            },
            async (page) => {
              await signInAsOkada(page)
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                    summary: allDayTitle,
                    startDate: allDayDate,
                  })
                ).id,
              )
              ids.push(
                (
                  await createGoogleEvent(page.request, OKADA.calendarId, {
                    summary: timedTitle,
                    date: timedDate,
                    start: '10:00',
                    end: '11:00',
                  })
                ).id,
              )
              await waitAllDaySynced(page, allDayDate, allDayTitle)
              await expect(
                page.getByTestId(/^schedule-event-/).filter({ hasText: timedTitle }),
              ).toBeVisible()
            },
            async ({ page, step, check }) => {
              await openWeek(page, allDayDate)
              const allDay = allDayLabel(page, allDayTitle)
              await step(
                `${OKADA.staff.name} の Google カレンダーに、${dayLabel(allDayDate)} の終日の予定「${allDayTitle}」と、${dayLabel(timedDate)} 10:00〜11:00 の「${timedTitle}」がある週を、週の表示で開く`,
              )
              await expect(calendarAllDayRowLabel(page)).toBeVisible()
              await expect(allDay).toHaveText(`${OKADA.staff.name} ${allDayTitle}`)
              await check(
                `${dayLabel(allDayDate)} の「終日」の行に「${OKADA.staff.name} ${allDayTitle}」が出る（列に入らない末尾は「…」で切れる）`,
              )

              await step(`「${allDayTitle}」にポインタを重ねる`)
              await allDay.hover()
              await expect(allDay).toHaveCSS('cursor', 'default')
              await check('ポインタが指の形にならない')

              await step(`「${allDayTitle}」を押す`)
              await allDay.click()
              await expect(page).toHaveURL(/\/schedule\?/)
              await expect(page.getByTestId('schedule-detail-modal')).toHaveCount(0)
              await check('URL が /schedule のままで、予定の詳細が開かない')

              await step(`対照として、同じ週の時刻のある予定「${timedTitle}」を押す`)
              const timed = page.getByTestId(/^schedule-event-/).filter({ hasText: timedTitle })
              await timed.scrollIntoViewIfNeeded()
              await timed.click()
              await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
              await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
              await check(`時刻のある予定は、押すと「${timedTitle}」の予定の詳細が開く`)
            },
          )
        } finally {
          await deleteEvents(request, OKADA.calendarId, ids)
        }
      })

      test(`${label}何日かにわたる終日の予定がある場合、月、日、幅 390px の週の一覧の表示で、かかる全ての日に出ること`, async ({
        browser,
        request,
      }) => {
        const sunday = sundayOfWeek(3)
        const days = [1, 2, 3].map((n) => addDays(sunday, n))
        const title = `合宿研修 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'all-day-span',
              title: '何日かにわたる終日の予定を、かかる全ての日に出す',
              actor: OKADA_ACTOR,
              variant,
            },
            async (page) => {
              await signInAsOkada(page)
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                    summary: title,
                    startDate: days[0],
                    lastDate: days[2],
                  })
                ).id,
              )
              await waitAllDaySynced(page, days[0], title)
            },
            async ({ page, step, check }) => {
              await page.goto(`/schedule?view=month&date=${days[0]}`)
              const bar = allDayLabel(page, title)
              await step(
                `${OKADA.staff.name} の Google カレンダーに、${dayLabel(days[0])} から ${dayLabel(days[2])} の 3 日の終日の予定「${title}」がある月を、月の表示で開く`,
              )
              await expect(bar).toHaveCount(1)
              await expect(bar).toBeVisible()
              await check(
                `${dayLabel(days[0])} から ${dayLabel(days[2])} の 3 日をつなぐ 1 本の帯で「${title}」が出る`,
              )

              for (const day of days) {
                await step(`日の表示で ${dayLabel(day)} を開く`)
                await openDay(page, day, OKADA.staff.id)
                await expect(page.getByTestId(`day-grid-all-day-${OKADA.staff.id}`)).toContainText(
                  title,
                )
                await check(
                  `${dayLabel(day)} の ${OKADA.staff.name} の名前の下に「${title}」が出る`,
                )
              }

              await step('画面の幅を 390px にし、週の一覧を開く')
              await page.setViewportSize(PHONE_VIEWPORT)
              await page.goto(`/schedule?view=week&date=${days[0]}`)
              await expect(page.getByTestId('schedule-agenda')).toBeVisible()
              for (const day of days) {
                const row = page.getByTestId(new RegExp(`^all-day-event-.+-${day}$`))
                await expect(row).toContainText(title)
                await expect(row).toBeInViewport()
                await expect(page.getByTestId(`schedule-agenda-day-${day}`)).toBeInViewport()
              }
              await check(
                `週の一覧の ${days.map(dayLabel).join('、')} のそれぞれの日の見出しの下に「${title}」が出る`,
              )
            },
          )
        } finally {
          await deleteEvents(request, OKADA.calendarId, ids)
        }
      })

      test(`${label}毎週の終日の予定の 1 つの回を除外している場合、回の日の「終日」の行に出て、除外した日には出ないこと`, async ({
        browser,
        request,
      }) => {
        const first = sundayOfWeek(4)
        const second = sundayOfWeek(5)
        const excluded = addDays(second, 4)
        const title = `定例 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'all-day-recurring',
              title: '繰り返しの終日の予定を回ごとに出す',
              actor: OKADA_ACTOR,
              variant,
            },
            async (page) => {
              await signInAsOkada(page)
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                    summary: title,
                    startDate: addDays(first, 1),
                    recurrence: [
                      'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=4',
                      `EXDATE;VALUE=DATE:${exDate(excluded)}`,
                    ],
                  })
                ).id,
              )
              await waitAllDaySynced(page, first, title)
            },
            async ({ page, step, check }) => {
              await openWeek(page, first)
              await step(
                `${OKADA.staff.name} の Google カレンダーに、毎週月曜と木曜の終日の予定「${title}」があり、${dayLabel(excluded)} の回を除外している。1 つ目の週を週の表示で開く`,
              )
              await expect(allDayLabel(page, title)).toHaveCount(2)
              await check(
                `${dayLabel(addDays(first, 1))} と ${dayLabel(addDays(first, 4))} の「終日」の行に「${title}」が出る（列に入らない末尾は「…」で切れる）`,
              )

              await step('次の週を開く')
              await openWeek(page, second)
              await expect(allDayLabel(page, title)).toHaveCount(1)
              await check(
                `${dayLabel(addDays(second, 1))} の「終日」の行に「${title}」が出て、除外した ${dayLabel(excluded)} には出ない`,
              )
            },
          )
        } finally {
          await deleteEvents(request, OKADA.calendarId, ids)
        }
      })

      test(`${label}表示している週に終日の予定も出せない予定も無い場合、「終日」の行が無く、通知の欄に同期の案内だけが出ること`, async ({
        browser,
        request,
      }) => {
        const empty = sundayOfWeek(9)
        const control = sundayOfWeek(10)
        const title = `研修 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'no-calendar-only',
              title: '終日の予定も出せない予定も無い週',
              actor: OKADA_ACTOR,
              variant,
            },
            async (page) => {
              await signInAsOkada(page)
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                    summary: title,
                    startDate: addDays(control, 3),
                  })
                ).id,
              )
              await waitAllDaySynced(page, control, title)
            },
            async ({ page, step, check }) => {
              await openWeek(page, empty)
              await step(
                `${OKADA.staff.name} の Google カレンダーに、終日の予定も出せない予定も無い週を、週の表示で開く`,
              )
              const notices = page.getByTestId('schedule-calendar-google-primary')
              await expect(notices).toContainText('予定は Google カレンダーと同期しています')
              await calendarTimeLabel(page, '06:00:00').hover()
              await wheel(page, { y: -2000 })
              await expect(calendarTimeLabel(page, '00:00:00')).toBeInViewport()
              await expect(calendarAllDayRowLabel(page)).toHaveCount(0)
              await expect(page.getByTestId('schedule-calendar-unlisted')).toHaveCount(0)
              await expect(page.getByTestId('schedule-calendar-needs-review')).toHaveCount(0)
              await expect(page.getByTestId('schedule-calendar-sync-warning')).toHaveCount(0)
              await check(
                '列の見出しのすぐ下が 0 時の時刻の格子で「終日」の行が無く、通知の欄には「予定は Google カレンダーと同期しています」の案内だけが出る',
              )

              await step(
                `対照として、${dayLabel(addDays(control, 3))} に終日の予定「${title}」がある週に移る`,
              )
              await openWeek(page, control)
              await expect(calendarAllDayRowLabel(page)).toBeVisible()
              await expect(allDayLabel(page, title)).toBeVisible()
              await check(
                `時刻の格子の上に「終日」の行が出て、「${title}」が出る（列に入らない末尾は「…」で切れる）`,
              )
            },
          )
        } finally {
          await deleteEvents(request, OKADA.calendarId, ids)
        }
      })

      test(`${label}buddy を正本にする事業所で週の表示を開いた場合、通知の欄と「終日」の行が無く、時刻のある予定は押すと詳細が開くこと`, async ({
        browser,
        request,
      }) => {
        const sunday = sundayOfWeek(11)
        const scheduleDate = addDays(sunday, 2)
        const allDayDate = addDays(sunday, 3)
        const spanStart = addDays(sunday, 4)
        const scheduleTitle = `カンファレンス ${stamp()}`
        const allDayTitle = `研修 ${stamp()}`
        const spanTitle = `合宿研修 ${stamp()}`
        const ids: string[] = []
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'buddy-primary',
              title: 'buddy を正本にする事業所',
              actor: AOKI_ACTOR,
              variant,
            },
            async (page) => {
              await page.goto('/schedule')
              await signInAtBroker(page, LOGIN_EMAIL)
              const token = await issueAccessToken(request, LOGIN_EMAIL)
              const res = await createNormalSchedule(request, token, STAFF_FORM.facilityId, {
                staffId: LOGIN_STAFF.id,
                title: scheduleTitle,
                date: scheduleDate,
              })
              expect(res.status()).toBe(201)
              ids.push(
                (
                  await createGoogleAllDayEvent(page.request, LEADER.email, {
                    summary: allDayTitle,
                    startDate: allDayDate,
                  })
                ).id,
              )
              ids.push(
                (
                  await createGoogleEvent(page.request, LEADER.email, {
                    summary: spanTitle,
                    date: spanStart,
                    start: '09:00',
                    endDate: addDays(spanStart, 1),
                    end: '18:00',
                  })
                ).id,
              )
              return ((await res.json()) as { id: string }).id
            },
            async ({ page, step, check }, scheduleId) => {
              await openWeek(page, scheduleDate)
              await step(
                `${LEADER.staff.name} の calendarpit のカレンダーに、${dayLabel(allDayDate)} の終日の予定「${allDayTitle}」と、${dayLabel(spanStart)} 09:00 から翌日 18:00 の「${spanTitle}」を作ってある。buddy を正本にする事業所の予定のカレンダーを、週の表示で開く`,
              )
              const event = page.getByTestId(`schedule-event-${scheduleId}`)
              await event.scrollIntoViewIfNeeded()
              await expect(event).toContainText(scheduleTitle)
              await expect(page.getByTestId('schedule-calendar-google-primary')).toHaveCount(0)
              await expect(page.getByTestId('schedule-calendar-unlisted')).toHaveCount(0)
              await expect(calendarAllDayRowLabel(page)).toHaveCount(0)
              await expect(page.getByTestId(/^all-day-event-/)).toHaveCount(0)
              await expect(
                page.getByTestId(/^schedule-event-/).filter({ hasText: spanTitle }),
              ).toHaveCount(0)
              await check(
                `通知の欄が無く、列の見出しのすぐ下が時刻の格子で「終日」の行が無い。calendarpit の「${allDayTitle}」と「${spanTitle}」は出ず、${dayLabel(scheduleDate)} の格子に「${scheduleTitle}」が出る`,
              )

              await step(`「${scheduleTitle}」を押す`)
              await event.click()
              await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
              await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
              await check(`「${scheduleTitle}」の予定の詳細が開く`)
            },
          )
        } finally {
          await deleteEvents(request, LEADER.email, ids)
        }
      })
    }
  })
})
