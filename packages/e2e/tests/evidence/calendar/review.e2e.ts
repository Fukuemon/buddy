import { expect, test, type Page } from '@playwright/test'

import { CALENDARPIT_URL, HAYASHI, LOGIN_NAME, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import {
  deleteGoogleEvent,
  findGoogleEvent,
  holdGoogleChanges,
  shiftGoogleEvent,
} from '../../fixtures/googleCalendar'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtIdp } from '../../screens/login'
import { calendarpitEvent } from '../../selectors/calendarpit'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/**
 * ログインして林にカレンダーを結び付け、林の予定を buddy で作り、林の Google カレンダーに出るのを待つ。
 * Google の予定の ID と日付を返す。
 */
const prepareExported = (title: string) => async (page: Page) => {
  await page.goto('/schedule/link')
  await signInAtIdp(page, LOGIN_NAME)
  await linkStaffCalendar(page, HAYASHI.id)
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-normal').check()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(title)
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${HAYASHI.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
  await expect
    .poll(async () => (await findGoogleEvent(page.request, HAYASHI.calendarId, title))?.status)
    .toBe('confirmed')
  const event = await findGoogleEvent(page.request, HAYASHI.calendarId, title)
  return { eventId: event?.id ?? '', date: event?.start?.dateTime?.slice(0, 10) ?? '' }
}

/** 日の表示で、林の予定のうちタイトルが from のものを開き、タイトルを to に変えて保存する。 */
const renameHayashiSchedule = async (page: Page, from: string, to: string) => {
  await page.goto('/schedule?view=day')
  await page
    .getByTestId(`day-grid-staff-${HAYASHI.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: from })
    .click()
  await page.getByTestId('schedule-detail-edit').click()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(to)
  await page.getByTestId('schedule-edit-submit').click()
  await expect(page.getByTestId('schedule-detail-modal')).toContainText(to)
}

const reviewRow = (page: Page) =>
  page.getByTestId(/^calendar-review-row-/).filter({ hasText: HAYASHI.name })

/** 確かめが要る予定の一覧を開き、林の行が出るまで読み直す。書き出しの処理が Google の応答を受けるまでは出ない。 */
const openReviewUntilRow = async (page: Page) => {
  await page.goto('/schedule/review')
  await expect(async () => {
    await page.reload()
    await expect(reviewRow(page)).toBeVisible()
  }).toPass()
}

test.describe('確かめが要る予定', () => {
  test.describe('Google カレンダーで直された予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}Google カレンダーで直された予定を buddy で変えた場合、確かめが要る予定に出て、buddy の内容で書き直せること`, async ({
        browser,
      }) => {
        const stamp = Date.now()
        const created = `会議 ${stamp}`
        const changed = `会議（buddy で変更）${stamp}`
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-rewrite',
            title:
              'Google カレンダーで直された予定を buddy で変えると、確かめが要る予定に出て、buddy の内容で書き直すと Google カレンダーが buddy のタイトルになる',
            actor: ACTOR,
            variant,
          },
          prepareExported(created),
          async ({ page, step, check }, { eventId, date }) => {
            const request = page.request
            try {
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, created)).toBeVisible()
              await step(
                `buddy で作った ${HAYASHI.name} の「${created}」が、林の Google カレンダー（calendarpit）に書き出してある`,
              )

              await step(
                '（撮影のため、職員が Google カレンダーで予定を直す代わりに、calendarpit の管理の API で 1 時間遅らせる。buddy が先に読まないよう、中継に変更を渡させない）',
              )
              await holdGoogleChanges(request, true)
              await shiftGoogleEvent(request, HAYASHI.calendarId, eventId)
              const shifted = await findGoogleEvent(request, HAYASHI.calendarId, created)
              expect(shifted?.start?.dateTime?.slice(11, 16)).toBe('10:00')
              await page.reload()
              await expect(calendarpitEvent(page, created)).toBeVisible()
              await check('calendarpit の予定が 9:00 から 10:00 に移る')

              await step(`buddy で「${created}」のタイトルを「${changed}」に変えて保存する`)
              await renameHayashiSchedule(page, created, changed)

              await step('確かめが要る予定の画面を開く')
              await openReviewUntilRow(page)
              await expect(reviewRow(page).getByTestId(/^calendar-review-reason-/)).toHaveText(
                'buddy と Google カレンダーの両方で予定が変わりました。どちらの内容に合わせるかを選んでください。',
              )
              await check(
                `${HAYASHI.name} の行が、「buddy と Google カレンダーの両方で予定が変わりました。…」の理由で出る`,
              )
              await holdGoogleChanges(request, false)

              await step('「buddy の内容で書き直す」を押し、確かめのダイアログで書き直す')
              await reviewRow(page)
                .getByTestId(/^calendar-review-rewrite-/)
                .click()
              const dialog = page.getByTestId('calendar-rewrite-dialog')
              await expect(dialog).toContainText(
                'Google カレンダーで直したタイトルと日時は消えます。',
              )
              await page.getByTestId('calendar-rewrite-submit').click()
              await expect(dialog).toBeHidden()
              await expect(reviewRow(page)).toHaveCount(0)
              await check('一覧から林の行が消える')

              await expect
                .poll(async () => (await findGoogleEvent(request, HAYASHI.calendarId, changed))?.id)
                .toBe(eventId)
              await step('calendarpit の管理の画面で、林のカレンダーを開く')
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, changed)).toBeVisible()
              await check(
                `Google カレンダーの予定が、buddy のタイトル「${changed}」と時刻に書き直される`,
              )
            } finally {
              await holdGoogleChanges(request, false)
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, HAYASHI.id)
            }
          },
        )
      })

      test(`${prefix}Google カレンダーで消された予定を buddy で変えた場合、確かめが要る予定に見つからないと出ること`, async ({
        browser,
      }) => {
        const stamp = Date.now()
        const created = `会議 ${stamp}`
        const changed = `会議（buddy で変更）${stamp}`
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-deleted',
            title:
              'Google カレンダーで消された予定を buddy で変えると、確かめが要る予定に「Google カレンダーで予定が見つかりません」と出る',
            actor: ACTOR,
            variant,
          },
          prepareExported(created),
          async ({ page, step, check }, { eventId, date }) => {
            const request = page.request
            try {
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, created)).toBeVisible()
              await step(
                `buddy で作った ${HAYASHI.name} の「${created}」が、林の Google カレンダー（calendarpit）に書き出してある`,
              )

              await step(
                '（撮影のため、職員が Google カレンダーで予定を消す代わりに、calendarpit の管理の API で消す。buddy が先に読まないよう、中継に変更を渡させない）',
              )
              await holdGoogleChanges(request, true)
              await deleteGoogleEvent(request, HAYASHI.calendarId, eventId)
              await page.reload()
              await expect(calendarpitEvent(page, created)).toBeHidden()
              await check('calendarpit の林のカレンダーから予定が消える')

              await step(`buddy で「${created}」のタイトルを「${changed}」に変えて保存する`)
              await renameHayashiSchedule(page, created, changed)

              await step('確かめが要る予定の画面を開く')
              await openReviewUntilRow(page)
              await expect(reviewRow(page).getByTestId(/^calendar-review-reason-/)).toHaveText(
                'Google カレンダーで予定が見つかりません。予定が消されたか、カレンダーの共有が外れていないかを、職員に確かめてください。',
              )
              await check(
                `${HAYASHI.name} の行が、「Google カレンダーで予定が見つかりません。…」の理由で出る`,
              )
            } finally {
              await holdGoogleChanges(request, false)
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, HAYASHI.id)
            }
          },
        )
      })
    }
  })

  test.describe('buddy でキャンセルした単発の予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}キャンセルした単発の予定が Google カレンダーで変わっていた場合、キャンセルした予定の理由が出て、Google の内容に合わせるボタンが出ないこと`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-calendar-calendarreviewview--default')
        const row = (page: Page) => page.getByTestId('calendar-review-row-export-5')
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-cancelled',
            title:
              'buddy でキャンセルした単発の予定が Google カレンダーで変わっていたとき、確かめが要る予定にキャンセルした予定の理由が出て、「Google の内容に合わせる」が出ない',
            actor: 'ログインなし（Storybook の story）',
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.goto(url)
            await expect(row(page)).toBeVisible()
            await step(
              '確かめが要る予定の画面（Storybook の CalendarReviewView の Default）を開いている\n江藤 四郎の 2026/11/06（金）15:00〜16:29 は、buddy でキャンセルした後に Google カレンダーで変えられた単発の予定である（架空のデータの export-5）',
            )

            await row(page).scrollIntoViewIfNeeded()
            await expect(row(page).getByTestId('calendar-review-reason-export-5')).toHaveText(
              'buddy でキャンセルした予定が、Google カレンダーで変わっていました。buddy の内容で書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確かめてください。',
            )
            await expect(row(page).getByTestId(/^calendar-review-accept-/)).toHaveCount(0)
            await expect(row(page).getByTestId('calendar-review-rewrite-export-5')).toBeVisible()
            await check(
              '江藤 四郎の行に「buddy でキャンセルした予定が、Google カレンダーで変わっていました。…」の理由が出て、「Google の内容に合わせる」が出ず、「予定を開く」と「buddy の内容で書き直す」が出る',
            )
          },
        )
      })

      test(`${prefix}キャンセルした単発の予定の行で buddy の内容で書き直すを押した場合、Google カレンダーの予定を消すことが分かるダイアログが出ること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-calendar-calendarreviewcontainer--default')
        const row = (page: Page) => page.getByTestId('calendar-review-row-export-5')
        const dialog = (page: Page) => page.getByTestId('calendar-rewrite-dialog')
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-cancelled-rewrite',
            title:
              'buddy でキャンセルした単発の予定の行で「buddy の内容で書き直す」を押すと、Google カレンダーの予定を消すことが分かるダイアログが出る',
            actor: 'ログインなし（Storybook の story）',
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.goto(url)
            await expect(row(page)).toBeVisible()
            await step(
              '確かめが要る予定の画面（Storybook の CalendarReviewContainer の Default）を開いている\n江藤 四郎の 2026/11/06（金）15:00〜16:29 は、buddy でキャンセルした後に Google カレンダーで変えられた単発の予定である（架空のデータの export-5）',
            )

            await row(page).scrollIntoViewIfNeeded()
            await step('江藤 四郎の行の「buddy の内容で書き直す」を押す')
            await row(page).getByTestId('calendar-review-rewrite-export-5').click()
            await expect(dialog(page).getByTestId('calendar-rewrite-target')).toHaveText(
              '2026/11/06（金）15:00〜16:29、江藤 四郎',
            )
            await expect(dialog(page).getByTestId('calendar-rewrite-notice')).toHaveText(
              'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。Google カレンダーの予定は、数十秒のうちに消えます。',
            )
            await check(
              '書き直すダイアログに「buddy でキャンセルした予定なので、Google カレンダーの予定を消します。…」の注意が出て、「消された予定は作り直します。」が出ない',
            )

            await step('（撮影のため、書き直さずに「キャンセル」で閉じる）')
            await dialog(page).getByTestId('calendar-rewrite-cancel').click()
            await expect(dialog(page)).toBeHidden()
          },
        )
      })
    }
  })
})
