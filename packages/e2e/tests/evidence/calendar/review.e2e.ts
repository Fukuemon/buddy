import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { CALENDARPIT_URL, HAYASHI, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { storyUrl } from '../../fixtures/evidence'
import {
  deleteGoogleEvent,
  findGoogleEvent,
  holdGoogleChanges,
  shiftGoogleEvent,
} from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { SCHEDULE_DETAIL_URL, scheduleIdFromUrl } from '../../fixtures/schedule'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'
import { calendarpitEvent } from '../../selectors/calendarpit'

const ACTOR = `${LOGIN_STAFF.name}、マネージャー、職員の管理の権限あり`
const REVIEW_URL = storyUrl('画面-calendar-calendarreviewcontainer--default')

/**
 * 録画の外で、林にカレンダーを結び付け、林の予定を buddy で作り、林の Google カレンダーに出るのを待つ。
 * Google の予定の ID と日付を返す。
 */
const prepareExported = (browser: Parameters<typeof prepareOutsideRecording>[0], title: string) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
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
  })

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

const openCalendarpit = (page: Page, date: string) =>
  page.goto(`${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${date}`)

/** buddy で予定のタイトルを変え、確認が必要な予定の画面で今回の予定の行が出るまで開く。予定の ID を返す。 */
const renameAndOpenReview = async (page: Page, created: string, changed: string) => {
  let scheduleId = ''
  await step(page, `buddy で「${created}」のタイトルを「${changed}」に変えて保存する`, async () => {
    scheduleId = await renameHayashiSchedule(page, created, changed)
  })
  await step(page, '確認が必要な予定の画面を開く', () => openReviewUntilRow(page, scheduleId))
  return scheduleId
}

const STORY_PREMISE_CANCELLED =
  '前提 確認が必要な予定の画面（Storybook の CalendarReviewContainer の Default）を開いている。江藤 四郎の 2026年11月6日（金） 15:00〜16:29 は、buddy でキャンセルした後に Google カレンダーで変えられた単発の予定である（架空のデータの export-5）'

test.describe('確認が必要な予定', () => {
  test.describe(`Google カレンダーで直された予定（${ACTOR}）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('calendar-review-rewrite Google カレンダーで直された予定を buddy で変えた場合、確認が必要な予定に出て、buddy の内容で書き直せること', async ({
      browser,
      context,
    }) => {
      const stamp = Date.now()
      const created = `会議 ${stamp}`
      const changed = `会議（buddy で変更）${stamp}`
      const { eventId, date } = await prepareExported(browser, created)

      const page = await context.newPage()
      const request = page.request
      try {
        await openCalendarpit(page, date)
        await expect(calendarpitEvent(page, created)).toBeVisible()
        await intro(
          page,
          `Google カレンダーで直された予定を buddy で変えると、確認が必要な予定に出て、buddy の内容で書き直すと Google カレンダーが buddy のタイトルになる\n前提 buddy で作った ${HAYASHI.name} の「${created}」が、林の Google カレンダー（calendarpit）に書き出してある`,
        )

        await step(
          page,
          '（撮影のため、職員が Google カレンダーで予定を直す代わりに、calendarpit の管理の API で 1 時間遅らせる。buddy が先に読まないよう、中継に変更を渡させない）',
          async () => {
            await holdGoogleChanges(request, true)
            await shiftGoogleEvent(request, HAYASHI.calendarId, eventId)
            await page.reload()
          },
        )
        await check(page, 'calendarpit の予定が 9:00 から 10:00 に移る', async () => {
          const shifted = await findGoogleEvent(request, HAYASHI.calendarId, created)
          expect(shifted?.start?.dateTime?.slice(11, 16)).toBe('10:00')
          await expect(calendarpitEvent(page, created)).toBeVisible()
        })

        const scheduleId = await renameAndOpenReview(page, created, changed)
        await check(
          page,
          `${HAYASHI.name} の今回の予定の行（最後に変わった日時がいちばん新しい行）が、「buddy と Google カレンダーの両方で予定が変わりました。」の理由で出る`,
          () =>
            expect(reviewRow(page, scheduleId).getByTestId(/^calendar-review-reason-/)).toHaveText(
              'buddy と Google カレンダーの両方で予定が変わりました。',
            ),
        )

        const dialog = page.getByTestId('calendar-rewrite-dialog')
        await step(
          page,
          '今回の予定の行を押し、出たダイアログの「buddy の内容で書き直す」を押し、確認のダイアログで書き直す',
          async () => {
            await holdGoogleChanges(request, false)
            await reviewRow(page, scheduleId).click()
            await page
              .getByTestId('calendar-review-dialog')
              .getByTestId(/^calendar-review-rewrite-/)
              .click()
            await expect(dialog).toContainText(
              'Google カレンダーで直したタイトルと日時は消えます。',
            )
            await page.getByTestId('calendar-rewrite-submit').click()
          },
        )
        await check(
          page,
          '一覧から今回の予定の行が消え、前の撮影が残した行があれば、その行は残る',
          async () => {
            await expect(dialog).toBeHidden()
            await expect(reviewRow(page, scheduleId)).toHaveCount(0)
          },
        )

        await step(page, 'calendarpit の管理の画面で、林のカレンダーを開く', async () => {
          await expect
            .poll(async () => (await findGoogleEvent(request, HAYASHI.calendarId, changed))?.id)
            .toBe(eventId)
          await openCalendarpit(page, date)
        })
        await check(
          page,
          `Google カレンダーの予定が、buddy のタイトル「${changed}」と時刻に書き直される`,
          () => expect(calendarpitEvent(page, changed)).toBeVisible(),
        )
      } finally {
        await holdGoogleChanges(request, false)
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, HAYASHI.id),
        )
      }
    })

    test('calendar-review-deleted Google カレンダーで消された予定を buddy で変えた場合、確認が必要な予定に見つからないと出ること', async ({
      browser,
      context,
    }) => {
      const stamp = Date.now()
      const created = `会議 ${stamp}`
      const changed = `会議（buddy で変更）${stamp}`
      const { eventId, date } = await prepareExported(browser, created)

      const page = await context.newPage()
      const request = page.request
      try {
        await openCalendarpit(page, date)
        await expect(calendarpitEvent(page, created)).toBeVisible()
        await intro(
          page,
          `Google カレンダーで消された予定を buddy で変えると、確認が必要な予定に「Google カレンダーで予定が見つかりません」と出る\n前提 buddy で作った ${HAYASHI.name} の「${created}」が、林の Google カレンダー（calendarpit）に書き出してある`,
        )

        await step(
          page,
          '（撮影のため、職員が Google カレンダーで予定を消す代わりに、calendarpit の管理の API で消す。buddy が先に読まないよう、中継に変更を渡させない）',
          async () => {
            await holdGoogleChanges(request, true)
            await deleteGoogleEvent(request, HAYASHI.calendarId, eventId)
            await page.reload()
          },
        )
        await check(page, 'calendarpit の林のカレンダーから予定が消える', () =>
          expect(calendarpitEvent(page, created)).toBeHidden(),
        )

        const scheduleId = await renameAndOpenReview(page, created, changed)
        await check(
          page,
          `${HAYASHI.name} の今回の予定の行（最後に変わった日時がいちばん新しい行）が、「Google カレンダーで予定が見つかりません。」の理由で出る`,
          () =>
            expect(reviewRow(page, scheduleId).getByTestId(/^calendar-review-reason-/)).toHaveText(
              'Google カレンダーで予定が見つかりません。',
            ),
        )
      } finally {
        await holdGoogleChanges(request, false)
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, HAYASHI.id),
        )
      }
    })
  })

  test.describe('buddy でキャンセルした単発の予定（ログインなし、Storybook の story）', () => {
    test('calendar-review-cancelled キャンセルした単発の予定が Google カレンダーで変わっていた場合、キャンセルした予定の理由が出て、buddy の内容で書き直すだけが出ること', async ({
      page,
    }) => {
      const row = page.getByTestId('calendar-review-row-schedule-schedule-4')
      const dialog = page.getByTestId('calendar-review-dialog')
      await page.goto(REVIEW_URL)
      await expect(row).toBeVisible()
      await intro(
        page,
        `buddy でキャンセルした単発の予定が Google カレンダーで変わっていたとき、確認が必要な予定にキャンセルした予定の理由が出て、予定の確認のダイアログに「buddy の内容で書き直す」だけが出る\n${STORY_PREMISE_CANCELLED}`,
      )

      await check(
        page,
        '江藤 四郎の行に「buddy でキャンセルした予定が、Google カレンダーで変わっていました。」の理由が出る',
        async () => {
          await row.scrollIntoViewIfNeeded()
          await expect(row.getByTestId('calendar-review-reason-export-5')).toHaveText(
            'buddy でキャンセルした予定が、Google カレンダーで変わっていました。',
          )
        },
      )

      await step(page, '江藤 四郎の行を押す', () => row.click())
      await check(
        page,
        '予定の確認のダイアログに「…書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。」の理由が出て、「Google の内容に合わせる」が出ず、「予定を開く」と「buddy の内容で書き直す」が出る',
        async () => {
          await expect(dialog.getByTestId('calendar-review-dialog-reason')).toHaveText(
            'buddy でキャンセルした予定が、Google カレンダーで変わっていました。書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。',
          )
          await expect(dialog.getByTestId('calendar-review-rewrite-export-5')).toBeVisible()
          await expect(dialog.getByTestId('calendar-review-open-export-5')).toBeVisible()
          await expect(dialog).not.toContainText('Google の内容に合わせる')
        },
      )
    })

    test('calendar-review-cancelled-rewrite キャンセルした単発の予定のダイアログで buddy の内容で書き直すを押した場合、Google カレンダーの予定を消すことが分かるダイアログが出て、戻るで予定のダイアログに戻ること', async ({
      page,
    }) => {
      const row = page.getByTestId('calendar-review-row-schedule-schedule-4')
      const reviewDialog = page.getByTestId('calendar-review-dialog')
      const dialog = page.getByTestId('calendar-rewrite-dialog')
      await page.goto(REVIEW_URL)
      await expect(row).toBeVisible()
      await row.scrollIntoViewIfNeeded()
      await intro(
        page,
        `buddy でキャンセルした単発の予定のダイアログで「buddy の内容で書き直す」を押すと、Google カレンダーの予定を消すことが分かるダイアログが出て、「戻る」で予定のダイアログに戻る\n${STORY_PREMISE_CANCELLED}`,
      )

      await step(
        page,
        '江藤 四郎の行を押し、出たダイアログの「buddy の内容で書き直す」を押す',
        async () => {
          await row.click()
          await reviewDialog.getByTestId('calendar-review-rewrite-export-5').click()
        },
      )
      await check(
        page,
        '予定のダイアログに替わって書き直すダイアログが出て、「buddy でキャンセルした予定なので、Google カレンダーの予定を消します。…」の注意が出て、「消された予定は作り直します。」が出ない。「書き直す」は赤い',
        async () => {
          await expect(dialog.getByTestId('calendar-rewrite-target')).toHaveText(
            '2026年11月6日（金） 15:00〜16:29、江藤 四郎',
          )
          await expect(dialog.getByTestId('calendar-rewrite-notice')).toHaveText(
            'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。',
          )
          await expect(dialog.getByTestId('calendar-rewrite-submit')).toHaveClass(
            /(^|\s)bg-danger(\s|$)/,
          )
        },
      )

      await step(page, '書き直さずに「戻る」を押す', () =>
        dialog.getByTestId('calendar-rewrite-cancel').click(),
      )
      await check(
        page,
        '書き直すダイアログが閉じ、江藤 四郎の予定の確認のダイアログに戻る',
        async () => {
          await expect(dialog).toBeHidden()
          await expect(reviewDialog.getByTestId('calendar-review-dialog-datetime')).toHaveText(
            '2026年11月6日（金） 15:00〜16:29',
          )
        },
      )
    })
  })

  test.describe('繰り返しの予定（ログインなし、Storybook の story）', () => {
    test('calendar-review-recurring-row 繰り返しの予定の行の場合、繰り返しの予定の ID の testid で指せること', async ({
      page,
    }) => {
      const row = page.getByTestId('calendar-review-row-recurring-recurring-1')
      const dialog = page.getByTestId('calendar-review-dialog')
      await page.goto(REVIEW_URL)
      await expect(row).toBeVisible()
      await intro(
        page,
        '確認が必要な予定のうち、予定の ID を持たない繰り返しの予定の行を、繰り返しの予定の ID の testid（calendar-review-row-recurring-<ID>）で指せる\n前提 確認が必要な予定の画面（Storybook の CalendarReviewContainer の Default）を開いている。石川 二葉の 2026年11月3日（火）から毎回 10:00〜11:00 は、Google カレンダーで消された繰り返しの予定である（架空のデータの recurring-1）',
      )

      await step(
        page,
        'testid が calendar-review-row-recurring-recurring-1 の行を指す（繰り返しの予定の行は、予定の ID を持たない）',
        async () => {
          await row.scrollIntoViewIfNeeded()
          await row.hover()
        },
      )
      await check(
        page,
        '指した行が、石川 二葉の「2026年11月3日（火）から毎回 10:00〜11:00」の行である',
        async () => {
          await expect(row.getByTestId(/^calendar-review-datetime-/)).toHaveText(
            '2026年11月3日（火）から毎回 10:00〜11:00',
          )
          await expect(row).toContainText('石川 二葉')
        },
      )

      await step(page, '指した行を押す', () => row.click())
      await check(
        page,
        '予定の確認のダイアログが開き、繰り返しの予定なので「予定を開く」が出ない',
        async () => {
          await expect(dialog.getByTestId('calendar-review-dialog-datetime')).toHaveText(
            '2026年11月3日（火）から毎回 10:00〜11:00',
          )
          await expect(dialog.getByTestId(/^calendar-review-rewrite-/)).toBeVisible()
          await expect(dialog.getByTestId(/^calendar-review-open-/)).toHaveCount(0)
        },
      )
    })
  })
})
