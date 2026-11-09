import { expect, test, type Page } from '@playwright/test'

import { CALENDARPIT_URL, HAYASHI, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import {
  deleteGoogleEvent,
  findGoogleEvent,
  holdGoogleChanges,
  shiftGoogleEvent,
} from '../../fixtures/googleCalendar'
import { SCHEDULE_DETAIL_URL, scheduleIdFromUrl } from '../../fixtures/schedule'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'
import { signInAtBroker } from '../../screens/login'
import { calendarpitEvent } from '../../selectors/calendarpit'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/**
 * ログインして林にカレンダーを結び付け、林の予定を buddy で作り、林の Google カレンダーに出るのを待つ。
 * Google の予定の ID と日付を返す。
 */
const prepareExported = (title: string) => async (page: Page) => {
  await page.goto('/schedule/link')
  await signInAtBroker(page, LOGIN_EMAIL)
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

/** 日の表示で、林の予定のうちタイトルが from のものを開き、タイトルを to に変えて保存する。開いた予定の ID を返す。 */
const renameHayashiSchedule = async (page: Page, from: string, to: string) => {
  await page.goto('/schedule?view=day')
  await page
    .getByTestId(`day-grid-staff-${HAYASHI.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: from })
    .click()
  await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
  const scheduleId = scheduleIdFromUrl(page.url())
  await page.getByTestId('schedule-detail-edit').click()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(to)
  await page.getByTestId('schedule-edit-submit').click()
  await expect(page.getByTestId('schedule-detail-modal')).toContainText(to)
  return scheduleId
}

/** 確認が必要な予定の一覧の、予定の行。前の撮影が同じ職員の行を残していても、今回の予定の行だけを指す。 */
const reviewRow = (page: Page, scheduleId: string) =>
  page.getByTestId(`calendar-review-row-schedule-${scheduleId}`)

/** 確認が必要な予定の一覧を開き、予定の行が出るまで読み直す。書き出しの処理が Google の応答を受けるまでは出ない。 */
const openReviewUntilRow = async (page: Page, scheduleId: string) => {
  await page.goto('/schedule/review')
  await expect(async () => {
    await page.reload()
    await expect(reviewRow(page, scheduleId)).toBeVisible()
  }).toPass()
}

test.describe('確認が必要な予定', () => {
  test.describe('Google カレンダーで直された予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}Google カレンダーで直された予定を buddy で変えた場合、確認が必要な予定に出て、buddy の内容で書き直せること`, async ({
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
              'Google カレンダーで直された予定を buddy で変えると、確認が必要な予定に出て、buddy の内容で書き直すと Google カレンダーが buddy のタイトルになる',
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
              const scheduleId = await renameHayashiSchedule(page, created, changed)

              await step('確認が必要な予定の画面を開く')
              await openReviewUntilRow(page, scheduleId)
              await expect(
                reviewRow(page, scheduleId).getByTestId(/^calendar-review-reason-/),
              ).toHaveText('buddy と Google カレンダーの両方で予定が変わりました。')
              await check(
                `${HAYASHI.name} の今回の予定の行（最後に変わった日時がいちばん新しい行）が、「buddy と Google カレンダーの両方で予定が変わりました。」の理由で出る`,
              )
              await holdGoogleChanges(request, false)

              await step(
                '今回の予定の行を押し、出たダイアログの「buddy の内容で書き直す」を押し、確認のダイアログで書き直す',
              )
              await reviewRow(page, scheduleId).click()
              await page
                .getByTestId('calendar-review-dialog')
                .getByTestId(/^calendar-review-rewrite-/)
                .click()
              const dialog = page.getByTestId('calendar-rewrite-dialog')
              await expect(dialog).toContainText(
                'Google カレンダーで直したタイトルと日時は消えます。',
              )
              await page.getByTestId('calendar-rewrite-submit').click()
              await expect(dialog).toBeHidden()
              await expect(reviewRow(page, scheduleId)).toHaveCount(0)
              await check('一覧から今回の予定の行が消え、前の撮影が残した行があれば、その行は残る')

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

      test(`${prefix}Google カレンダーで消された予定を buddy で変えた場合、確認が必要な予定に見つからないと出ること`, async ({
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
              'Google カレンダーで消された予定を buddy で変えると、確認が必要な予定に「Google カレンダーで予定が見つかりません」と出る',
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
              const scheduleId = await renameHayashiSchedule(page, created, changed)

              await step('確認が必要な予定の画面を開く')
              await openReviewUntilRow(page, scheduleId)
              await expect(
                reviewRow(page, scheduleId).getByTestId(/^calendar-review-reason-/),
              ).toHaveText('Google カレンダーで予定が見つかりません。')
              await check(
                `${HAYASHI.name} の今回の予定の行（最後に変わった日時がいちばん新しい行）が、「Google カレンダーで予定が見つかりません。」の理由で出る`,
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

      test(`${prefix}キャンセルした単発の予定が Google カレンダーで変わっていた場合、キャンセルした予定の理由が出て、buddy の内容で書き直すだけが出ること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-calendar-calendarreviewcontainer--default')
        const row = (page: Page) => page.getByTestId('calendar-review-row-schedule-schedule-4')
        const dialog = (page: Page) => page.getByTestId('calendar-review-dialog')
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-cancelled',
            title:
              'buddy でキャンセルした単発の予定が Google カレンダーで変わっていたとき、確認が必要な予定にキャンセルした予定の理由が出て、予定の確認のダイアログに「buddy の内容で書き直す」だけが出る',
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
              '確認が必要な予定の画面（Storybook の CalendarReviewContainer の Default）を開いている\n江藤 四郎の 2026年11月6日（金） 15:00〜16:29 は、buddy でキャンセルした後に Google カレンダーで変えられた単発の予定である（架空のデータの export-5）',
            )

            await row(page).scrollIntoViewIfNeeded()
            await expect(row(page).getByTestId('calendar-review-reason-export-5')).toHaveText(
              'buddy でキャンセルした予定が、Google カレンダーで変わっていました。',
            )
            await check(
              '江藤 四郎の行に「buddy でキャンセルした予定が、Google カレンダーで変わっていました。」の理由が出る',
            )

            await step('江藤 四郎の行を押す')
            await row(page).click()
            await expect(dialog(page).getByTestId('calendar-review-dialog-reason')).toHaveText(
              'buddy でキャンセルした予定が、Google カレンダーで変わっていました。書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。',
            )
            await expect(dialog(page).getByTestId('calendar-review-rewrite-export-5')).toBeVisible()
            await expect(dialog(page).getByTestId('calendar-review-open-export-5')).toBeVisible()
            await expect(dialog(page)).not.toContainText('Google の内容に合わせる')
            await check(
              '予定の確認のダイアログに「…書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。」の理由が出て、「Google の内容に合わせる」が出ず、「予定を開く」と「buddy の内容で書き直す」が出る',
            )
          },
        )
      })

      test(`${prefix}キャンセルした単発の予定のダイアログで buddy の内容で書き直すを押した場合、Google カレンダーの予定を消すことが分かるダイアログが出て、戻るで予定のダイアログに戻ること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-calendar-calendarreviewcontainer--default')
        const row = (page: Page) => page.getByTestId('calendar-review-row-schedule-schedule-4')
        const reviewDialog = (page: Page) => page.getByTestId('calendar-review-dialog')
        const dialog = (page: Page) => page.getByTestId('calendar-rewrite-dialog')
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-cancelled-rewrite',
            title:
              'buddy でキャンセルした単発の予定のダイアログで「buddy の内容で書き直す」を押すと、Google カレンダーの予定を消すことが分かるダイアログが出て、「戻る」で予定のダイアログに戻る',
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
              '確認が必要な予定の画面（Storybook の CalendarReviewContainer の Default）を開いている\n江藤 四郎の 2026年11月6日（金） 15:00〜16:29 は、buddy でキャンセルした後に Google カレンダーで変えられた単発の予定である（架空のデータの export-5）',
            )

            await row(page).scrollIntoViewIfNeeded()
            await step('江藤 四郎の行を押し、出たダイアログの「buddy の内容で書き直す」を押す')
            await row(page).click()
            await reviewDialog(page).getByTestId('calendar-review-rewrite-export-5').click()
            await expect(dialog(page).getByTestId('calendar-rewrite-target')).toHaveText(
              '2026年11月6日（金） 15:00〜16:29、江藤 四郎',
            )
            await expect(dialog(page).getByTestId('calendar-rewrite-notice')).toHaveText(
              'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。',
            )
            await expect(dialog(page).getByTestId('calendar-rewrite-submit')).toHaveClass(
              /(^|\s)bg-danger(\s|$)/,
            )
            await check(
              '予定のダイアログに替わって書き直すダイアログが出て、「buddy でキャンセルした予定なので、Google カレンダーの予定を消します。…」の注意が出て、「消された予定は作り直します。」が出ない。「書き直す」は赤い',
            )

            await step('書き直さずに「戻る」を押す')
            await dialog(page).getByTestId('calendar-rewrite-cancel').click()
            await expect(dialog(page)).toBeHidden()
            await expect(
              reviewDialog(page).getByTestId('calendar-review-dialog-datetime'),
            ).toHaveText('2026年11月6日（金） 15:00〜16:29')
            await check('書き直すダイアログが閉じ、江藤 四郎の予定の確認のダイアログに戻る')
          },
        )
      })
    }
  })

  test.describe('繰り返しの予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}繰り返しの予定の行の場合、繰り返しの予定の ID の testid で指せること`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-calendar-calendarreviewcontainer--default')
        const row = (page: Page) => page.getByTestId('calendar-review-row-recurring-recurring-1')
        const dialog = (page: Page) => page.getByTestId('calendar-review-dialog')
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-recurring-row',
            title:
              '確認が必要な予定のうち、予定の ID を持たない繰り返しの予定の行を、繰り返しの予定の ID の testid（calendar-review-row-recurring-<ID>）で指せる',
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
              '確認が必要な予定の画面（Storybook の CalendarReviewContainer の Default）を開いている\n石川 二葉の 2026年11月3日（火）から毎回 10:00〜11:00 は、Google カレンダーで消された繰り返しの予定である（架空のデータの recurring-1）',
            )

            await step(
              'testid が calendar-review-row-recurring-recurring-1 の行を指す（繰り返しの予定の行は、予定の ID を持たない）',
            )
            await row(page).scrollIntoViewIfNeeded()
            await row(page).hover()
            await expect(row(page).getByTestId(/^calendar-review-datetime-/)).toHaveText(
              '2026年11月3日（火）から毎回 10:00〜11:00',
            )
            await expect(row(page)).toContainText('石川 二葉')
            await check(
              '指した行が、石川 二葉の「2026年11月3日（火）から毎回 10:00〜11:00」の行である',
            )

            await step('指した行を押す')
            await row(page).click()
            await expect(dialog(page).getByTestId('calendar-review-dialog-datetime')).toHaveText(
              '2026年11月3日（火）から毎回 10:00〜11:00',
            )
            await expect(dialog(page).getByTestId(/^calendar-review-rewrite-/)).toBeVisible()
            await expect(dialog(page).getByTestId(/^calendar-review-open-/)).toHaveCount(0)
            await check('予定の確認のダイアログが開き、繰り返しの予定なので「予定を開く」が出ない')
          },
        )
      })
    }
  })
})
