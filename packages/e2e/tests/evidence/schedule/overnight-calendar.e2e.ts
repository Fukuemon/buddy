import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { createOvernightSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { calendarTimeLabel } from '../../selectors/scheduleCalendar'

/**
 * 夜勤の予定の開始の日（火曜）と翌日。予定は 22:00 に始まり、翌日の 01:00 に終わる。
 * test ごとに週を分け、ほかの test で作った夜勤と重ならないようにする。
 */
const WEEK = { start: '2026-11-10', next: '2026-11-11' }
const NEXT_DAY = { start: '2026-11-17', next: '2026-11-18' }
const DETAIL = { start: '2026-11-24', next: '2026-11-25' }
const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

/** ログインし、青木 陽菜の夜勤の予定を作って、予定の ID を返す。 */
const signInWithOvernight = async (
  page: Page,
  request: APIRequestContext,
  title: string,
  date: string,
) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
  const token = await issueAccessToken(request, LOGIN_EMAIL)
  const res = await createOvernightSchedule(request, token, STAFF_FORM.facilityId, {
    staffId: LOGIN_STAFF.id,
    title,
    date,
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

test.describe('予定のカレンダー', () => {
  test.describe('0 時から 24 時の表示と、日をまたぐ予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}週の表示を開いた場合、6 時の位置が出ており、上に送ると 0 時、下に送ると 24 時まで出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-calendar-0-to-24',
            title:
              '週の表示を開くと 6 時の位置が出ており、上に送ると 0 時、下に送ると 24 時まで出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto(`/schedule?view=week&date=${WEEK.start}`)
            await expect(calendarTimeLabel(page, '06:00:00')).toBeInViewport()
            await step('予定のカレンダーを週の表示で開く')
            await expect(calendarTimeLabel(page, '00:00:00')).not.toBeInViewport()
            await check('左端の時刻の上端に 6時 が出ている')

            await step('カレンダーを上へ送る')
            await calendarTimeLabel(page, '06:00:00').hover()
            await page.mouse.wheel(0, -2000)
            await expect(calendarTimeLabel(page, '00:00:00')).toBeInViewport()
            await check('0時 まで出る')

            await step('カレンダーを下へ送る')
            await page.mouse.wheel(0, 4000)
            await expect(calendarTimeLabel(page, '23:00:00')).toBeInViewport()
            await check('23時 の枠の下端の 24 時まで出る')
          },
        )
      })

      test(`${prefix}22 時から翌日の 1 時までの予定がある週を開いた場合、開始の日に 22 時から 24 時、翌日に 0 時から 1 時の予定が描かれること`, async ({
        browser,
        request,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-overnight-week',
            title:
              '22 時から翌日の 1 時までの予定がある週を開くと、開始の日に 22 時から 24 時、翌日に 0 時から 1 時の予定が描かれる',
            actor: ACTOR,
            variant,
          },
          (page) => signInWithOvernight(page, request, '夜勤（週の表示）', WEEK.start),
          async ({ page, step, check }, id) => {
            await page.goto(`/schedule?view=week&date=${WEEK.start}`)
            await expect(calendarTimeLabel(page, '06:00:00')).toBeInViewport()
            await step(
              '11月10日（火）の 22:00 から翌日の 01:00 までの「夜勤（週の表示）」がある週を、週の表示で開く',
            )

            await step('カレンダーを下へ送り、22 時から翌日の 1 時を出す')
            const segments = page.getByTestId(`schedule-event-${id}`)
            await segments.first().scrollIntoViewIfNeeded()
            await expect(segments).toHaveCount(2)
            await expect(segments.first()).toBeInViewport()
            await expect(segments.first()).toContainText('22:00〜翌 01:00 夜勤（週の表示）')
            await check('11月10日（火）の 22 時から 24 時に、予定が描かれる')

            await step('カレンダーを上へ送り、0 時から 1 時を出す')
            await segments.last().scrollIntoViewIfNeeded()
            await expect(segments.last()).toBeInViewport()
            await expect(segments.last()).toContainText('22:00〜翌 01:00 夜勤（週の表示）')
            await check('11月11日（水）の 0 時から 1 時に、同じ予定が描かれる')
          },
        )
      })

      test(`${prefix}22 時から翌日の 1 時までの予定の翌日だけを日の表示で開いた場合、0 時から 1 時にその予定が描かれること`, async ({
        browser,
        request,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-overnight-next-day',
            title:
              '22 時から翌日の 1 時までの予定の翌日だけを日の表示で開くと、0 時から 1 時にその予定が描かれる',
            actor: ACTOR,
            variant,
          },
          (page) => signInWithOvernight(page, request, '夜勤（日の表示）', NEXT_DAY.start),
          async ({ page, step, check }, id) => {
            await page.goto(`/schedule?view=day&date=${NEXT_DAY.next}&staff=${LOGIN_STAFF.id}`)
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await step(
              '11月17日（火）の 22:00 から翌日の 01:00 までの「夜勤（日の表示）」の翌日の 11月18日（水）を、日の表示で開く',
            )

            await step('カレンダーを上へ送り、0 時から 1 時を出す')
            const event = page.getByTestId(`schedule-event-${id}`)
            await event.scrollIntoViewIfNeeded()
            await expect(event).toBeInViewport()
            await expect(event).toContainText('22:00〜翌 01:00 夜勤（日の表示）')
            await expect(page.getByTestId(`day-grid-slot-${LOGIN_STAFF.id}-00:00`)).toBeInViewport()
            await check('0 時から 1 時に、その予定が描かれる')
          },
        )
      })

      test(`${prefix}翌日の側に描かれた予定を押した場合、開始の日の 22 時から翌日の 1 時の予定として詳細が開くこと`, async ({
        browser,
        request,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-overnight-detail',
            title:
              '翌日の側に描かれた予定を押すと、開始の日の 22 時から翌日の 1 時の予定として詳細が開く',
            actor: ACTOR,
            variant,
          },
          (page) => signInWithOvernight(page, request, '夜勤（詳細）', DETAIL.start),
          async ({ page, step, check }, id) => {
            await page.goto(`/schedule?view=week&date=${DETAIL.start}`)
            await expect(calendarTimeLabel(page, '06:00:00')).toBeInViewport()
            const nextDaySegment = page.getByTestId(`schedule-event-${id}`).last()
            await nextDaySegment.scrollIntoViewIfNeeded()
            await expect(nextDaySegment).toBeInViewport()
            await step(
              '週の表示で、11月25日（水）の 0 時から 1 時に描かれた「夜勤（詳細）」を出している',
            )

            await step('11月25日（水）の 0 時から 1 時の「夜勤（詳細）」を押す')
            await nextDaySegment.click()
            await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
              '2026年11月24日（火） 22:00〜翌 01:00',
            )
            await check('予定の詳細が開き、日時が「2026年11月24日（火） 22:00〜翌 01:00」と出る')
          },
        )
      })
    }
  })
})
