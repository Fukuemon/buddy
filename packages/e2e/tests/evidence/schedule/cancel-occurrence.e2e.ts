import { expect, test, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { CALENDARPIT_URL, HAYASHI, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { findGoogleEvent } from '../../fixtures/googleCalendar'
import { createWeeklyNormalSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'
import { calendarpitText } from '../../selectors/calendarpit'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

/** 毎週の予定の最初の回の日（月曜）。キャンセルする回と、残る次の回は、その後の月曜にする。 */
const FIRST_DATE = '2026-11-16'
const CANCEL_DATE = '2026-11-23'
const NEXT_DATE = '2026-11-30'

/**
 * ログインし、林にカレンダーを結び付けてから、林の毎週の予定を予定の API で作る。予定の作成の画面からは繰り返しの予定を作れない。
 * 結び付けた後に作るので、書き出しが繰り返しの予定を林の Google カレンダーに書く。
 */
const prepareWeekly = (title: string) => async (page: Page) => {
  await page.goto('/schedule/link')
  await signInAtBroker(page, LOGIN_EMAIL)
  await linkStaffCalendar(page, HAYASHI.id)
  const token = await issueAccessToken(page.request, LOGIN_EMAIL)
  const res = await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
    staffId: HAYASHI.id,
    title,
    date: FIRST_DATE,
  })
  expect(res.status()).toBe(201)
  await expect
    .poll(async () => (await findGoogleEvent(page.request, HAYASHI.calendarId, title))?.status)
    .toBe('confirmed')
}

const openDay = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
}

/** 日の表示の林の列の、title の予定。キャンセルした予定の取り消し線の要素（-cancelled）は数えない。 */
const hayashiEvent = (page: Page, title: string) =>
  page
    .getByTestId(`day-grid-staff-${HAYASHI.id}`)
    .getByTestId(/^schedule-event-(?!.*-cancelled$)/)
    .filter({ hasText: title })

/** 予定の詳細を開いている回を、理由 reason でキャンセルし、詳細が閉じるまで待つ。 */
const cancelOpened = async (page: Page, reason: string) => {
  await page.getByTestId('schedule-detail-cancel-schedule').click()
  const dialog = page.getByTestId('schedule-cancel-dialog')
  await dialog.getByTestId('schedule-cancel-reason').fill(reason)
  await dialog.getByTestId('schedule-cancel-submit').click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
}

/**
 * calendarpit の管理の API で、林のカレンダーの予定 eventId の応答を開く。応答の recurrence に、繰り返しの規則と除外する日が出る。
 * calendarpit の管理の画面は、繰り返しの予定を最初の日にだけ出し、後の回と除外した回を出さないためである。
 */
const openGoogleEvent = (page: Page, eventId: string) =>
  page.goto(
    `${CALENDARPIT_URL}/__calendarpit/calendars/${encodeURIComponent(HAYASHI.calendarId)}/events/${encodeURIComponent(eventId)}`,
  )

/** キャンセルする回の日を除外する日にした、Google の予定の recurrence の行。 */
const CANCEL_EXDATE = 'EXDATE;TZID=Asia/Tokyo:20261123T100000'

test.describe('予定の詳細', () => {
  test.describe('繰り返しの予定の回のキャンセル', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}buddy で管理する事業所で繰り返しの予定の 1 回をキャンセルした場合、その回だけがカレンダーから消えること`, async ({
        browser,
      }) => {
        const title = `定例 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'cancel-occurrence-calendar',
            title:
              'buddy で管理する事業所で、繰り返しの予定の 1 回を予定の詳細からキャンセルすると、その回だけがカレンダーから消える',
            actor: ACTOR,
            variant,
          },
          prepareWeekly(title),
          async ({ page, step, check }) => {
            try {
              await openDay(page, CANCEL_DATE)
              const event = hayashiEvent(page, title)
              await expect(event).toBeVisible()
              await event.scrollIntoViewIfNeeded()
              await step(
                `${CANCEL_DATE} の日の表示を開いている。${HAYASHI.name} の列の 10:00〜11:00 に、毎週の予定「${title}」の回が出ている`,
              )

              await step('予定を押して詳細を開く')
              await event.click()
              await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
              if (isBefore) {
                await expect(page.getByTestId('schedule-detail-edit')).toBeVisible()
                await expect(page.getByTestId('schedule-detail-cancel-schedule')).toHaveCount(0)
                await check('繰り返しの予定の回には「予定をキャンセル」が出ず、キャンセルできない')
                return
              }
              await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
              await check('繰り返しの予定の回にも「予定をキャンセル」が出る')

              await step(
                '「予定をキャンセル」を押し、理由に「利用者の入院」を入れて「予定をキャンセルする」を押す',
              )
              await cancelOpened(page, '利用者の入院')
              await expect(hayashiEvent(page, title)).toHaveCount(0)
              await check(`${CANCEL_DATE} の ${HAYASHI.name} の列から「${title}」が消える`)

              await step('左のサイドバーの「キャンセルした予定を出す」を入れる')
              await page.getByTestId('calendar-show-cancelled').check()
              await expect(hayashiEvent(page, title)).toBeVisible()
              await check(`キャンセルした回は、キャンセルした予定として「${title}」が出る`)

              await step(`次の回の ${NEXT_DATE} の日の表示を開く`)
              await openDay(page, NEXT_DATE)
              await expect(hayashiEvent(page, title)).toBeVisible()
              await check(`${NEXT_DATE} の回の「${title}」は残る`)
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, HAYASHI.id)
            }
          },
        )
      })
    }

    // 改修前は回をキャンセルできないので、改修後だけを撮る
    for (const variant of EVIDENCE_VARIANTS.filter(({ name }) => name !== 'before')) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}繰り返しの予定の 1 回をキャンセルした後に書き出しが動いた場合、Google カレンダーからその回だけが消えること`, async ({
        browser,
        request,
      }) => {
        const title = `定例 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'cancel-occurrence-export',
            title:
              '繰り返しの予定の 1 回をキャンセルすると、書き出しが Google カレンダー（calendarpit）の繰り返しの予定からその回だけを消す',
            actor: ACTOR,
            variant,
          },
          prepareWeekly(title),
          async ({ page, step, check }) => {
            try {
              const event = await findGoogleEvent(request, HAYASHI.calendarId, title)
              const eventId = event?.id ?? ''
              await openGoogleEvent(page, eventId)
              await expect(calendarpitText(page, 'RRULE:FREQ=WEEKLY;BYDAY=MO')).toBeVisible()
              await expect(calendarpitText(page, 'EXDATE')).toHaveCount(0)
              await step(
                `${HAYASHI.name} に Google カレンダー（${HAYASHI.calendarId}、calendarpit）を結び付けてある。calendarpit の管理の API で毎週の予定「${title}」を開くと、recurrence は毎週月曜の規則だけで、除外する日（EXDATE）が無い`,
              )

              await step(`buddy の ${CANCEL_DATE} の日の表示で、その回を開いてキャンセルする`)
              await openDay(page, CANCEL_DATE)
              await hayashiEvent(page, title).click()
              await cancelOpened(page, '利用者の入院')
              await expect(hayashiEvent(page, title)).toHaveCount(0)

              // 書き出しは別の処理が行うので、繰り返しの予定に EXDATE が付くまで待ってから回を開き直す
              await expect
                .poll(async () =>
                  (await findGoogleEvent(request, HAYASHI.calendarId, title))?.recurrence?.join(
                    '\n',
                  ),
                )
                .toContain(CANCEL_EXDATE)
              await step('書き出しが動いた後に、calendarpit の管理の API で同じ予定を開き直す')
              await openGoogleEvent(page, eventId)
              await expect(calendarpitText(page, CANCEL_EXDATE)).toBeVisible()
              await expect(calendarpitText(page, 'RRULE:FREQ=WEEKLY;BYDAY=MO')).toBeVisible()
              await check(
                `recurrence に ${CANCEL_DATE} の除外（${CANCEL_EXDATE}）だけが足され、毎週月曜の規則はそのまま。Google カレンダーからその回だけが消え、${NEXT_DATE} などのほかの回は残る`,
              )
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
