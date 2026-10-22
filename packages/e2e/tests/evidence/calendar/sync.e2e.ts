import { expect, test, type Page } from '@playwright/test'

import { CALENDARPIT_URL, LOGIN_NAME, LOGIN_STAFF, SATO } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  findGoogleEvent,
  holdGoogleChanges,
  shiftGoogleEvent,
  type GoogleEvent,
} from '../../fixtures/googleCalendar'
import { SCHEDULE_DETAIL_URL, scheduleIdFromUrl } from '../../fixtures/schedule'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtIdp } from '../../screens/login'
import { calendarpitEvent } from '../../selectors/calendarpit'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/**
 * ログインして佐藤にカレンダーを結び付け、佐藤の予定を buddy で作り、佐藤の Google カレンダーに出るのを待つ。
 * Google の予定の ID と日付を返す。
 */
const prepareExported = (title: string) => async (page: Page) => {
  await page.goto('/schedule/link')
  await signInAtIdp(page, LOGIN_NAME)
  await linkStaffCalendar(page, SATO.id)
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${SATO.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-normal').check()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(title)
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${SATO.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
  await expect
    .poll(async () => (await findGoogleEvent(page.request, SATO.calendarId, title))?.status)
    .toBe('confirmed')
  const event = await findGoogleEvent(page.request, SATO.calendarId, title)
  return { eventId: event?.id ?? '', date: event?.start?.dateTime?.slice(0, 10) ?? '' }
}

/** Google カレンダーの予定の日時を、予定の詳細の日時の形（2026-10-22 10:00 - 11:00）にする。 */
const detailDateTime = (event: GoogleEvent | undefined) => {
  const start = event?.start?.dateTime ?? ''
  const end = event?.end?.dateTime ?? ''
  return `${start.slice(0, 10)} ${start.slice(11, 16)} - ${end.slice(11, 16)}`
}

/** 日の表示で、佐藤の予定のうちタイトルが title のものを開き、予定の ID を返す。 */
const openSatoSchedule = async (page: Page, title: string) => {
  await page.goto('/schedule?view=day')
  await page
    .getByTestId(`day-grid-staff-${SATO.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })
    .click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
  await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
  return scheduleIdFromUrl(page.url())
}

/** 確かめが要る予定の一覧の、予定の行。前の撮影が同じ職員の行を残していても、今回の予定の行だけを指す。 */
const reviewRow = (page: Page, scheduleId: string) =>
  page.getByTestId(`calendar-review-row-schedule-${scheduleId}`)

test.describe('確かめが要る予定', () => {
  test.describe('Google カレンダーとの同期', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}Google カレンダーで予定を遅らせた場合、buddy の予定も同じ日時になること`, async ({
        browser,
      }) => {
        const title = `会議 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-sync-google-change',
            title:
              '職員が Google カレンダーで予定を 1 時間遅らせると、数秒のうちに buddy の予定も同じ日時になる',
            actor: ACTOR,
            variant,
          },
          prepareExported(title),
          async ({ page, step, check }, { eventId, date }) => {
            const request = page.request
            try {
              await openSatoSchedule(page, title)
              await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
                `${date} 09:00 - 10:00`,
              )
              await step(
                `${SATO.name} の「${title}」を開いている。予定は ${SATO.name} の Google カレンダー（calendarpit）に書き出してある`,
              )

              await step(
                '（撮影のため、職員が Google カレンダーで予定を直す代わりに、calendarpit の管理の API で 1 時間遅らせる）',
              )
              await shiftGoogleEvent(request, SATO.calendarId, eventId)
              const shifted = detailDateTime(await findGoogleEvent(request, SATO.calendarId, title))
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(SATO.calendarId)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, title)).toBeVisible()
              await check(`calendarpit の ${SATO.calendarId} の予定が ${shifted.slice(11)} になる`)

              await step('buddy で同じ予定を開き直す（buddy は数秒ごとに Google の変更を読む）')
              await expect(async () => {
                await openSatoSchedule(page, title)
                await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(shifted)
              }).toPass()
              await check(`buddy の予定の日時も ${shifted} になる`)
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, SATO.id)
            }
          },
        )
      })

      test(`${prefix}buddy と Google カレンダーの両方で変えた予定を Google の内容に合わせた場合、buddy の予定が Google のタイトルと日時になること`, async ({
        browser,
      }) => {
        const stamp = Date.now()
        const created = `会議 ${stamp}`
        const changed = `会議（buddy で変更）${stamp}`
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-sync-accept-google',
            title:
              'buddy と Google カレンダーの両方で変わった予定が確かめが要る予定に出て、「Google の内容に合わせる」と buddy の予定が Google のタイトルと日時になる',
            actor: ACTOR,
            variant,
          },
          prepareExported(created),
          async ({ page, step, check }, { eventId }) => {
            const request = page.request
            try {
              const scheduleId = await openSatoSchedule(page, created)
              await step(
                `${SATO.name} の「${created}」を開いている。予定は ${SATO.name} の Google カレンダー（calendarpit）に書き出してある`,
              )

              await step(
                '（撮影のため、職員が Google カレンダーで予定を直す代わりに、calendarpit の管理の API で 1 時間遅らせる。buddy が先に読まないよう、中継に変更を渡させない）',
              )
              await holdGoogleChanges(request, true)
              await shiftGoogleEvent(request, SATO.calendarId, eventId)

              await step(`buddy で「${created}」のタイトルを「${changed}」に変えて保存する`)
              await page.getByTestId('schedule-detail-edit').click()
              await page.getByTestId('schedule-field-title').click()
              await page.getByTestId('schedule-form-title').fill(changed)
              await page.getByTestId('schedule-edit-submit').click()
              await expect(page.getByTestId('schedule-detail-modal')).toContainText(changed)

              await step('確かめが要る予定の画面を開く')
              await page.goto('/schedule/review')
              await expect(async () => {
                await page.reload()
                await expect(reviewRow(page, scheduleId)).toBeVisible()
              }).toPass()
              await expect(
                reviewRow(page, scheduleId).getByTestId(/^calendar-review-reason-/),
              ).toHaveText(
                'buddy と Google カレンダーの両方で予定が変わりました。どちらの内容に合わせるかを選んでください。',
              )
              await check(
                `${SATO.name} の今回の予定の行（最後に変わった日時がいちばん新しい行）が、「buddy と Google カレンダーの両方で予定が変わりました。…」の理由で出る`,
              )
              await holdGoogleChanges(request, false)

              await step('「Google の内容に合わせる」を押し、確かめのダイアログで合わせる')
              await reviewRow(page, scheduleId)
                .getByTestId(/^calendar-review-accept-/)
                .click()
              const dialog = page.getByTestId('calendar-accept-dialog')
              await expect(dialog).toContainText('buddy で変えたタイトルと日時は消えます。')
              await page.getByTestId('calendar-accept-submit').click()
              await expect(dialog).toBeHidden()
              await expect(reviewRow(page, scheduleId)).toHaveCount(0)
              await check('一覧から今回の予定の行が消え、前の撮影が残した行があれば、その行は残る')

              const google = detailDateTime(
                await findGoogleEvent(request, SATO.calendarId, created),
              )
              await step(`buddy で「${created}」を開く`)
              await openSatoSchedule(page, created)
              await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(google)
              await check(`buddy の予定が、Google のタイトル「${created}」と日時 ${google} になる`)
            } finally {
              await holdGoogleChanges(request, false)
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, SATO.id)
            }
          },
        )
      })
    }
  })
})
