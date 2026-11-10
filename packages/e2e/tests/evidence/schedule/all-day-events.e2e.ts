import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { addDays, dayLabel, sundayOfWeek } from '../../fixtures/date'
import {
  LEADER,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  OKADA,
  OKADA_STATE,
} from '../../fixtures/env'
import {
  createGoogleAllDayEvent,
  createGoogleEvent,
  deleteGoogleEvent,
} from '../../fixtures/googleCalendar'
import { PHONE_VIEWPORT, prepareOutsideRecording } from '../../fixtures/recording'
import { createNormalSchedule, SCHEDULE_DETAIL_URL } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { openDay } from '../../screens/scheduleCalendar'
import { calendarAllDayRowLabel, calendarTimeLabel } from '../../selectors/scheduleCalendar'
import { wheel } from '../../widgets/scroll/actions/scroll'

/**
 * 予定のタイトルの後ろに付ける、今の時刻のミリ秒の下 3 桁。走らせるたびに違うタイトルにする。
 * 週の表示の列は狭く、長いタイトルは末尾が切れるので、時刻の全ての桁は付けない。
 */
const stamp = () => String(Date.now()).slice(-3)

/** EXDATE の行に書く、終日の回の日付（YYYYMMDD）。 */
const exDate = (date: string) => date.replaceAll('-', '')

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
  test.describe(`Google カレンダーの終日の予定（${OKADA.staff.name}、Google カレンダーを正本にする事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('all-day-week Google カレンダーを正本にする事業所で表示している週に終日の予定がある場合、その日の「終日」の行に押せないラベルで出ること', async ({
      browser,
      context,
      request,
    }) => {
      const sunday = sundayOfWeek(2)
      const allDayDate = addDays(sunday, 2)
      const timedDate = addDays(sunday, 4)
      const allDayTitle = `研修 ${stamp()}`
      const timedTitle = `担当者会議 ${stamp()}`
      const ids: string[] = []
      try {
        await prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
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
        })

        const page = await context.newPage()
        await openWeek(page, allDayDate)
        const allDay = allDayLabel(page, allDayTitle)
        await expect(allDay).toBeVisible()
        await intro(
          page,
          `週の表示の終日の予定\n前提 ${OKADA.staff.name} の Google カレンダーに、${dayLabel(allDayDate)} の終日の予定「${allDayTitle}」と、${dayLabel(timedDate)} 10:00〜11:00 の「${timedTitle}」がある週を、週の表示で開いている`,
        )

        await check(
          page,
          `${dayLabel(allDayDate)} の「終日」の行に「${OKADA.staff.name} ${allDayTitle}」が出る（列に入らない末尾は「…」で切れる）`,
          async () => {
            await expect(calendarAllDayRowLabel(page)).toBeVisible()
            await expect(allDay).toHaveText(`${OKADA.staff.name} ${allDayTitle}`)
          },
        )

        await step(page, `「${allDayTitle}」にポインタを重ねる`, () => allDay.hover())
        await check(page, 'ポインタが指の形にならない', () =>
          expect(allDay).toHaveCSS('cursor', 'default'),
        )

        await step(page, `「${allDayTitle}」を押す`, () => allDay.click())
        await check(page, 'URL が /schedule のままで、予定の詳細が開かない', async () => {
          await expect(page).toHaveURL(/\/schedule\?/)
          await expect(page.getByTestId('schedule-detail-modal')).toHaveCount(0)
        })

        await step(page, `対照として、同じ週の時刻のある予定「${timedTitle}」を押す`, async () => {
          const timed = page.getByTestId(/^schedule-event-/).filter({ hasText: timedTitle })
          await timed.scrollIntoViewIfNeeded()
          await timed.click()
        })
        await check(
          page,
          `時刻のある予定は、押すと「${timedTitle}」の予定の詳細が開く`,
          async () => {
            await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
            await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
          },
        )
      } finally {
        await deleteEvents(request, OKADA.calendarId, ids)
      }
    })

    test('all-day-span 何日かにわたる終日の予定がある場合、月、日、幅 390px の週の一覧の表示で、かかる全ての日に出ること', async ({
      browser,
      context,
      request,
    }) => {
      const sunday = sundayOfWeek(3)
      const days = [1, 2, 3].map((n) => addDays(sunday, n))
      const title = `合宿研修 ${stamp()}`
      const ids: string[] = []
      try {
        await prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
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
        })

        const page = await context.newPage()
        await page.goto(`/schedule?view=month&date=${days[0]}`)
        const bar = allDayLabel(page, title)
        await expect(bar.first()).toBeVisible()
        await intro(
          page,
          `何日かにわたる終日の予定を、かかる全ての日に出す\n前提 ${OKADA.staff.name} の Google カレンダーに、${dayLabel(days[0])} から ${dayLabel(days[2])} の 3 日の終日の予定「${title}」がある月を、月の表示で開いている`,
        )

        await check(
          page,
          `${dayLabel(days[0])} から ${dayLabel(days[2])} の 3 日をつなぐ 1 本の帯で「${title}」が出る`,
          async () => {
            await expect(bar).toHaveCount(1)
            await expect(bar).toBeVisible()
          },
        )

        for (const day of days) {
          await step(page, `日の表示で ${dayLabel(day)} を開く`, () =>
            openDay(page, day, OKADA.staff.id),
          )
          await check(
            page,
            `${dayLabel(day)} の ${OKADA.staff.name} の名前の下に「${title}」が出る`,
            () =>
              expect(page.getByTestId(`day-grid-all-day-${OKADA.staff.id}`)).toContainText(title),
          )
        }

        await step(page, '画面の幅を 390px にし、週の一覧を開く', async () => {
          await page.setViewportSize(PHONE_VIEWPORT)
          await page.goto(`/schedule?view=week&date=${days[0]}`)
          await expect(page.getByTestId('schedule-agenda')).toBeVisible()
        })
        // 行の testid は予定の API の内部の ID を含み spec から組み立てられないので、タイトルで絞った行を日の順に読む
        const rows = page.getByTestId(/^all-day-event-/).filter({ hasText: title })
        const headingTop = async (day: string) =>
          (await page.getByTestId(`schedule-agenda-day-${day}`).boundingBox())?.y ?? NaN
        await check(
          page,
          `週の一覧の ${days.map(dayLabel).join('、')} のそれぞれの日の見出しの下に「${title}」が出る`,
          async () => {
            await expect(rows).toHaveCount(days.length)
            for (const [i, day] of days.entries()) {
              const row = rows.nth(i)
              await expect(row).toBeInViewport()
              await expect(page.getByTestId(`schedule-agenda-day-${day}`)).toBeInViewport()
              const rowTop = (await row.boundingBox())?.y ?? NaN
              // 行が、その日の見出しの下で、次の日の見出しより上にあることで、どの日の行かを確認する
              expect(rowTop).toBeGreaterThan(await headingTop(day))
              expect(rowTop).toBeLessThan(await headingTop(addDays(day, 1)))
            }
          },
        )
      } finally {
        await deleteEvents(request, OKADA.calendarId, ids)
      }
    })

    test('all-day-recurring 毎週の終日の予定の 1 つの回を除外している場合、回の日の「終日」の行に出て、除外した日には出ないこと', async ({
      browser,
      context,
      request,
    }) => {
      const first = sundayOfWeek(4)
      const second = sundayOfWeek(5)
      const excluded = addDays(second, 4)
      const title = `定例 ${stamp()}`
      const ids: string[] = []
      try {
        await prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
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
        })

        const page = await context.newPage()
        await openWeek(page, first)
        await expect(allDayLabel(page, title).first()).toBeVisible()
        await intro(
          page,
          `繰り返しの終日の予定を回ごとに出す\n前提 ${OKADA.staff.name} の Google カレンダーに、毎週月曜と木曜の終日の予定「${title}」があり、${dayLabel(excluded)} の回を除外している。1 つ目の週を週の表示で開いている`,
        )

        await check(
          page,
          `${dayLabel(addDays(first, 1))} と ${dayLabel(addDays(first, 4))} の「終日」の行に「${title}」が出る（列に入らない末尾は「…」で切れる）`,
          () => expect(allDayLabel(page, title)).toHaveCount(2),
        )

        await step(page, '次の週を開く', () => openWeek(page, second))
        await check(
          page,
          `${dayLabel(addDays(second, 1))} の「終日」の行に「${title}」が出て、除外した ${dayLabel(excluded)} には出ない`,
          () => expect(allDayLabel(page, title)).toHaveCount(1),
        )
      } finally {
        await deleteEvents(request, OKADA.calendarId, ids)
      }
    })

    test('no-calendar-only 表示している週に終日の予定も出せない予定も無い場合、「終日」の行が無く、通知の欄に同期の案内だけが出ること', async ({
      browser,
      context,
      request,
    }) => {
      const empty = sundayOfWeek(9)
      const control = sundayOfWeek(10)
      const title = `研修 ${stamp()}`
      const ids: string[] = []
      try {
        await prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
          ids.push(
            (
              await createGoogleAllDayEvent(page.request, OKADA.calendarId, {
                summary: title,
                startDate: addDays(control, 3),
              })
            ).id,
          )
          await waitAllDaySynced(page, control, title)
        })

        const page = await context.newPage()
        await openWeek(page, empty)
        const notices = page.getByTestId('schedule-calendar-google-primary')
        await expect(notices).toContainText('予定は Google カレンダーと同期しています')
        await intro(
          page,
          `終日の予定も出せない予定も無い週\n前提 ${OKADA.staff.name} の Google カレンダーに、終日の予定も出せない予定も無い週を、週の表示で開いている`,
        )

        // 送る操作には止めが入らず、step の字幕が読めないので、送る字幕を判定の字幕の 1 行目に書く
        await calendarTimeLabel(page, '06:00:00').hover()
        await wheel(page, { y: -2000 })
        await check(
          page,
          '（撮影のため、時刻の格子を 0 時まで送る）\n列の見出しのすぐ下が 0 時の時刻の格子で「終日」の行が無く、通知の欄には「予定は Google カレンダーと同期しています」の案内だけが出る',
          async () => {
            await expect(calendarTimeLabel(page, '00:00:00')).toBeInViewport()
            await expect(calendarAllDayRowLabel(page)).toHaveCount(0)
            await expect(page.getByTestId('schedule-calendar-unlisted')).toHaveCount(0)
            await expect(page.getByTestId('schedule-calendar-needs-review')).toHaveCount(0)
            await expect(page.getByTestId('schedule-calendar-sync-warning')).toHaveCount(0)
          },
        )

        await step(
          page,
          `対照として、${dayLabel(addDays(control, 3))} に終日の予定「${title}」がある週に移る`,
          () => openWeek(page, control),
        )
        await check(
          page,
          `時刻の格子の上に「終日」の行が出て、「${title}」が出る（列に入らない末尾は「…」で切れる）`,
          async () => {
            await expect(calendarAllDayRowLabel(page)).toBeVisible()
            await expect(allDayLabel(page, title)).toBeVisible()
          },
        )
      } finally {
        await deleteEvents(request, OKADA.calendarId, ids)
      }
    })
  })

  test.describe(`Google カレンダーの終日の予定（${LOGIN_STAFF.name}、buddy を正本にする事業所のマネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('buddy-primary buddy を正本にする事業所で週の表示を開いた場合、通知の欄と「終日」の行が無く、時刻のある予定は押すと詳細が開くこと', async ({
      browser,
      context,
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
        const scheduleId = await prepareOutsideRecording(
          browser,
          { storageState: LOGIN_STATE },
          async (page) => {
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
        )

        const page = await context.newPage()
        await openWeek(page, scheduleDate)
        const event = page.getByTestId(`schedule-event-${scheduleId}`)
        await expect(event).toBeAttached()
        await intro(
          page,
          `buddy を正本にする事業所\n前提 ${LEADER.staff.name} の calendarpit のカレンダーに、${dayLabel(allDayDate)} の終日の予定「${allDayTitle}」と、${dayLabel(spanStart)} 09:00 から翌日 18:00 の「${spanTitle}」を作ってある。buddy を正本にする事業所の予定のカレンダーを、週の表示で開いている`,
        )

        await check(
          page,
          `通知の欄が無く、列の見出しのすぐ下が時刻の格子で「終日」の行が無い。calendarpit の「${allDayTitle}」と「${spanTitle}」は出ず、${dayLabel(scheduleDate)} の格子に「${scheduleTitle}」が出る`,
          async () => {
            await event.scrollIntoViewIfNeeded()
            await expect(event).toContainText(scheduleTitle)
            await expect(page.getByTestId('schedule-calendar-google-primary')).toHaveCount(0)
            await expect(page.getByTestId('schedule-calendar-unlisted')).toHaveCount(0)
            await expect(calendarAllDayRowLabel(page)).toHaveCount(0)
            await expect(page.getByTestId(/^all-day-event-/)).toHaveCount(0)
            await expect(
              page.getByTestId(/^schedule-event-/).filter({ hasText: spanTitle }),
            ).toHaveCount(0)
          },
        )

        await step(page, `「${scheduleTitle}」を押す`, () => event.click())
        await check(page, `「${scheduleTitle}」の予定の詳細が開く`, async () => {
          await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
          await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
        })
      } finally {
        await deleteEvents(request, LEADER.email, ids)
      }
    })
  })
})
