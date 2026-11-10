import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_EMAIL, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { createOvernightSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { calendarTimeLabel } from '../../selectors/scheduleCalendar'
import { wheel } from '../../widgets/scroll/actions/scroll'

/**
 * 夜勤の予定の開始の日（火曜）と翌日。予定は 22:00 に始まり、翌日の 01:00 に終わる。
 * test ごとに週を分け、ほかの test で作った夜勤と重ならないようにする。
 */
const WEEK = { start: '2026-11-10', next: '2026-11-11' }
const NEXT_DAY = { start: '2026-11-17', next: '2026-11-18' }
const DETAIL = { start: '2026-11-24', next: '2026-11-25' }

/** 録画する page を開く前に、青木 陽菜の夜勤の予定を予定の API で作って、予定の ID を返す。 */
const createOvernight = async (request: APIRequestContext, title: string, date: string) => {
  const token = await issueAccessToken(request, LOGIN_EMAIL)
  const res = await createOvernightSchedule(request, token, STAFF_FORM.facilityId, {
    staffId: LOGIN_STAFF.id,
    title,
    date,
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** 週の表示で date の週を開き、時刻の列が出るまで待つ。 */
const openWeekView = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=week&date=${date}`)
  await expect(calendarTimeLabel(page, '06:00:00')).toBeInViewport()
}

test.describe('予定のカレンダー', () => {
  test.describe(`0 時から 24 時の表示と、日をまたぐ予定（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-calendar-0-to-24 週の表示を開いた場合、6 時の位置が出ており、上に送ると 0 時、下に送ると 24 時まで出ること', async ({
      page,
    }) => {
      await openWeekView(page, WEEK.start)
      await intro(
        page,
        '週の表示を開くと 6 時の位置が出ており、上に送ると 0 時、下に送ると 24 時まで出る\n前提 予定のカレンダーを週の表示で開いている',
      )
      await check(page, '左端の時刻の上端に 6時 が出ている', () =>
        expect(calendarTimeLabel(page, '00:00:00')).not.toBeInViewport(),
      )

      await step(page, 'カレンダーを上へ送る', async () => {
        await calendarTimeLabel(page, '06:00:00').hover()
        await wheel(page, { y: -2000 })
      })
      await check(page, '0時 まで出る', () =>
        expect(calendarTimeLabel(page, '00:00:00')).toBeInViewport(),
      )

      await step(page, 'カレンダーを下へ送る', () => wheel(page, { y: 4000 }))
      await check(page, '23時 の枠の下端の 24 時まで出る', () =>
        expect(calendarTimeLabel(page, '23:00:00')).toBeInViewport(),
      )
    })

    test('schedule-overnight-week 22 時から翌日の 1 時までの予定がある週を開いた場合、開始の日に 22 時から 24 時、翌日に 0 時から 1 時の予定が描かれること', async ({
      context,
      request,
    }) => {
      const id = await createOvernight(request, '夜勤（週の表示）', WEEK.start)

      const page = await context.newPage()
      await openWeekView(page, WEEK.start)
      await intro(
        page,
        '22 時から翌日の 1 時までの予定がある週を開くと、開始の日に 22 時から 24 時、翌日に 0 時から 1 時の予定が描かれる\n前提 11月10日（火）の 22:00 から翌日の 01:00 までの「夜勤（週の表示）」がある週を、週の表示で開いている',
      )

      const segments = page.getByTestId(`schedule-event-${id}`)
      await step(page, 'カレンダーを下へ送り、22 時から翌日の 1 時を出す', () =>
        segments.first().scrollIntoViewIfNeeded(),
      )
      await check(page, '11月10日（火）の 22 時から 24 時に、予定が描かれる', async () => {
        await expect(segments).toHaveCount(2)
        await expect(segments.first()).toBeInViewport()
        await expect(segments.first()).toContainText('22:00〜翌 01:00 夜勤（週の表示）')
      })

      await step(page, 'カレンダーを上へ送り、0 時から 1 時を出す', () =>
        segments.last().scrollIntoViewIfNeeded(),
      )
      await check(page, '11月11日（水）の 0 時から 1 時に、同じ予定が描かれる', async () => {
        await expect(segments.last()).toBeInViewport()
        await expect(segments.last()).toContainText('22:00〜翌 01:00 夜勤（週の表示）')
      })
    })

    test('schedule-overnight-next-day 22 時から翌日の 1 時までの予定の翌日だけを日の表示で開いた場合、0 時から 1 時にその予定が描かれること', async ({
      context,
      request,
    }) => {
      const id = await createOvernight(request, '夜勤（日の表示）', NEXT_DAY.start)

      const page = await context.newPage()
      await page.goto(`/schedule?view=day&date=${NEXT_DAY.next}&staff=${LOGIN_STAFF.id}`)
      await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
      await intro(
        page,
        '22 時から翌日の 1 時までの予定の翌日だけを日の表示で開くと、0 時から 1 時にその予定が描かれる\n前提 11月17日（火）の 22:00 から翌日の 01:00 までの「夜勤（日の表示）」の翌日の 11月18日（水）を、日の表示で開いている',
      )

      const event = page.getByTestId(`schedule-event-${id}`)
      await step(page, 'カレンダーを上へ送り、0 時から 1 時を出す', () =>
        event.scrollIntoViewIfNeeded(),
      )
      await check(page, '0 時から 1 時に、その予定が描かれる', async () => {
        await expect(event).toBeInViewport()
        await expect(event).toContainText('22:00〜翌 01:00 夜勤（日の表示）')
        await expect(page.getByTestId(`day-grid-slot-${LOGIN_STAFF.id}-00:00`)).toBeInViewport()
      })
    })

    test('schedule-overnight-detail 翌日の側に描かれた予定を押した場合、開始の日の 22 時から翌日の 1 時の予定として詳細が開くこと', async ({
      context,
      request,
    }) => {
      const id = await createOvernight(request, '夜勤（詳細）', DETAIL.start)

      const page = await context.newPage()
      await openWeekView(page, DETAIL.start)
      const nextDaySegment = page.getByTestId(`schedule-event-${id}`).last()
      await nextDaySegment.scrollIntoViewIfNeeded()
      await expect(nextDaySegment).toBeInViewport()
      await intro(
        page,
        '翌日の側に描かれた予定を押すと、開始の日の 22 時から翌日の 1 時の予定として詳細が開く\n前提 週の表示で、11月25日（水）の 0 時から 1 時に描かれた「夜勤（詳細）」を出している',
      )

      await step(page, '11月25日（水）の 0 時から 1 時の「夜勤（詳細）」を押す', () =>
        nextDaySegment.click(),
      )
      await check(
        page,
        '予定の詳細が開き、日時が「2026年11月24日（火） 22:00〜翌 01:00」と出る',
        () =>
          expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
            '2026年11月24日（火） 22:00〜翌 01:00',
          ),
      )
    })
  })
})
