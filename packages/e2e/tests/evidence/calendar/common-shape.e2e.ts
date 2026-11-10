import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { HAYASHI, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { findGoogleEvent, holdGoogleChanges, shiftGoogleEvent } from '../../fixtures/googleCalendar'
import { PHONE_VIEWPORT, prepareOutsideRecording } from '../../fixtures/recording'
import { SCHEDULE_DETAIL_URL, scheduleIdFromUrl } from '../../fixtures/schedule'
import { linkStaffCalendar } from '../../setup/calendar'
import { commonShapeParts } from '../../selectors/commonShape'
import { pageRoot } from '../../selectors/page'

/** 確認が必要な予定の一覧の、単発の予定の行。 */
const scheduleRows = (page: Page) => page.getByTestId(/^calendar-review-row-schedule-/)

/** カレンダーの連携の画面を開き、林にカレンダーを結び付けていなければ結び付ける。 */
const ensureHayashiLinked = async (page: Page) => {
  await page.goto('/schedule/link')
  await page.getByTestId(`calendar-link-row-${HAYASHI.id}`).waitFor()
  if (await page.getByTestId(`calendar-link-menu-${HAYASHI.id}`).isVisible()) return
  await linkStaffCalendar(page, HAYASHI.id)
}

/**
 * 林の予定を buddy で作って Google カレンダーに書き出し、Google カレンダーと buddy の両方で変えて、確認が必要な予定に出す。
 * 職員が Google カレンダーで直す代わりに、calendarpit の管理の API で 1 時間遅らせる。buddy が先に読まないよう、その間は中継に変更を渡させない。
 */
const createConflict = async (page: Page) => {
  const request = page.request
  const stamp = Date.now()
  const created = `会議 ${stamp}`
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-normal').check()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(created)
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${HAYASHI.id}`).check()
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
  await expect
    .poll(async () => (await findGoogleEvent(request, HAYASHI.calendarId, created))?.status)
    .toBe('confirmed')
  const event = await findGoogleEvent(request, HAYASHI.calendarId, created)

  await holdGoogleChanges(request, true)
  try {
    await shiftGoogleEvent(request, HAYASHI.calendarId, event?.id ?? '')
    await page.goto('/schedule?view=day')
    await page
      .getByTestId(`day-grid-staff-${HAYASHI.id}`)
      .getByTestId(/^schedule-event-/)
      .filter({ hasText: created })
      .click()
    await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
    const scheduleId = scheduleIdFromUrl(page.url())
    await page.getByTestId('schedule-detail-edit').click()
    await page.getByTestId('schedule-field-title').click()
    await page.getByTestId('schedule-form-title').fill(`会議（buddy で変更）${stamp}`)
    await page.getByTestId('schedule-edit-submit').click()
    await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
    await page.goto('/schedule/review')
    await expect(async () => {
      await page.reload()
      await expect(page.getByTestId(`calendar-review-row-schedule-${scheduleId}`)).toBeVisible()
    }).toPass()
  } finally {
    await holdGoogleChanges(request, false)
  }
}

/** 録画の外で、確認が必要な予定に単発の予定の行が 1 件も無ければ作る。前の撮影の行があれば、それを使う。 */
const prepareReview = (browser: Parameters<typeof prepareOutsideRecording>[0]) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
    await page.goto('/schedule/review')
    await expect(page.getByTestId('calendar-review-loading')).toBeHidden()
    if ((await scheduleRows(page).count()) > 0) return
    await ensureHayashiLinked(page)
    await createConflict(page)
  })

const ACTOR = `${LOGIN_STAFF.name}、マネージャー、職員の管理の権限あり`

test.describe('画面の共通の形', () => {
  test.describe(`スマートフォンの幅（${ACTOR}）`, () => {
    test.use({ storageState: LOGIN_STATE, viewport: PHONE_VIEWPORT })

    test('review-list-phone スマートフォンの幅で確認が必要な予定を開いた場合、予定が 2 行のリストで並び、横にスクロールしないこと', async ({
      browser,
      context,
    }) => {
      await prepareReview(browser)

      const page = await context.newPage()
      await page.goto('/schedule/review')
      const row = scheduleRows(page).first()
      await expect(row).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅で確認が必要な予定を開き、2 行のリストの行を見る\n前提 スマートフォンの幅（390x844）で、確認が必要な予定の画面を開いている',
      )

      await check(
        page,
        '行の 1 行目に予定の日時、2 行目に職員と最後に変わった日時が「・」でつながって並び、理由は出ない。画面は横にスクロールしない',
        async () => {
          await expect(row.getByTestId(/^calendar-review-reason-/)).toBeHidden()
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
        },
      )
    })

    test('link-list-phone スマートフォンの幅でカレンダーの連携を開いた場合、職員が 2 行のリストで並び、外すは行のメニューにあること', async ({
      browser,
      context,
    }) => {
      await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, ensureHayashiLinked)

      const page = await context.newPage()
      await page.goto('/schedule/link')
      const row = page.getByTestId(`calendar-link-row-${HAYASHI.id}`)
      await row.scrollIntoViewIfNeeded()
      await expect(page.getByTestId(`calendar-link-menu-${HAYASHI.id}`)).toBeVisible()
      await intro(
        page,
        `スマートフォンの幅でカレンダーの連携を開き、2 行のリストの行と、行の操作のメニューを見る\n前提 スマートフォンの幅（390x844）で、カレンダーの連携の画面を開いている。${HAYASHI.name} にカレンダーを結び付けてある`,
      )

      await check(
        page,
        `職員の行は、1 行目に職員の名前と行の操作、2 行目にカレンダーの ID と最後の取り込みが並ぶ。結び付けた ${HAYASHI.name} の行に「外す」のボタンは無く、画面は横にスクロールしない`,
        async () => {
          await expect(page.getByTestId(`calendar-link-remove-${HAYASHI.id}`)).toHaveCount(0)
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
        },
      )

      await step(page, `${HAYASHI.name} の行の右端の「…」を押す`, () =>
        page.getByTestId(`calendar-link-menu-${HAYASHI.id}`).click(),
      )
      const menu = page.getByTestId(`calendar-link-menu-list-${HAYASHI.id}`)
      await check(page, 'メニューに「取り込む」と、赤の「外す」がこの順に出る', async () => {
        await page.getByTestId(`calendar-link-remove-${HAYASHI.id}`).scrollIntoViewIfNeeded()
        await expect(commonShapeParts(menu).menuItems).toHaveText(['取り込む', '外す'])
      })
    })
  })

  test.describe(`パソコンの幅（${ACTOR}）`, () => {
    test.use({ storageState: LOGIN_STATE })

    // 改修前は右上の × で閉じ、改修後はフッターの「閉じる」で閉じる。改修前と改修後で操作が違うので、改修後の流れだけを撮る
    test('review-detail-dialog buddy を正本にする事業所で確認が必要な予定の行を押した場合、予定と、buddy の内容で書き直すと、閉じるためのボタンを入れたダイアログが出ること', async ({
      browser,
      context,
    }) => {
      await prepareReview(browser)

      const page = await context.newPage()
      await page.goto('/schedule/review')
      const row = scheduleRows(page).first()
      await expect(row).toBeVisible()
      await expect(commonShapeParts(row).buttons).toHaveCount(1)
      await intro(
        page,
        'buddy を正本にする事業所で確認が必要な予定の行を押し、予定と書き直すだけを入れたダイアログを見て、閉じる\n前提 確認が必要な予定の画面を開いている。行に、行ごとのボタンは無い',
      )

      await step(page, '1 行目の予定の行を押す', () => row.click())
      const dialog = page.getByTestId('calendar-review-dialog')
      const rewrite = dialog.getByTestId(/^calendar-review-rewrite-/)
      await check(
        page,
        '「食い違った予定」のダイアログに、予定の日時、職員、最後に変わった日時、理由、予定を開くが出て、右上に × が無く、フッターの左端に赤い文字の「buddy の内容で書き直す」と、右に「閉じる」が出る',
        async () => {
          await expect(dialog).toBeVisible()
          await expect(dialog.getByTestId('calendar-review-dialog-datetime')).toBeVisible()
          await expect(dialog.getByTestId('calendar-review-dialog-reason')).toBeVisible()
          await expect(rewrite).not.toHaveClass(/bg-primary/)
          await expect(dialog).not.toContainText('Google の内容に合わせる')
          // #886 でフッターのボタンも「閉じる」になったので、右上の × が無ければ、フッターの 1 件だけが当たる
          await expect(commonShapeParts(dialog).closeButton).toHaveCount(1)
          await expect(rewrite).toHaveClass(/text-danger/)
          await expect(dialog.getByTestId('calendar-review-cancel')).toHaveText('閉じる')
        },
      )

      await step(page, 'フッターの「閉じる」を押す', () =>
        dialog.getByTestId('calendar-review-cancel').click(),
      )
      await check(page, 'ダイアログが閉じ、一覧に戻る', () => expect(dialog).toBeHidden())
    })

    test('review-rewrite-confirm buddy の内容で書き直すを確定するダイアログを開いた場合、確定のボタンが赤で出ること', async ({
      browser,
      context,
    }) => {
      await prepareReview(browser)

      const page = await context.newPage()
      await page.goto('/schedule/review')
      const row = scheduleRows(page).first()
      await expect(row).toBeVisible()
      await intro(
        page,
        '予定の確認のダイアログで buddy の内容で書き直すを押し、確定のボタンの色を見て、戻るで戻る\n前提 確認が必要な予定の画面を開いている',
      )

      const detail = page.getByTestId('calendar-review-dialog')
      await step(
        page,
        '確認が必要な予定の 1 行目を押し、予定の確認のダイアログを開く',
        async () => {
          await row.click()
          await expect(detail).toBeVisible()
        },
      )
      await step(page, '「buddy の内容で書き直す」を押す', () =>
        detail.getByTestId(/^calendar-review-rewrite-/).click(),
      )
      const confirm = page.getByTestId('calendar-rewrite-dialog')
      await check(
        page,
        '「buddy の内容で書き直しますか」の確認のダイアログが出て、確定の「書き直す」が赤い面で出る。× は無い',
        async () => {
          await expect(confirm).toBeVisible()
          await expect(confirm.getByTestId('calendar-rewrite-submit')).toHaveClass(/bg-danger/)
        },
      )

      await step(page, '「戻る」を押す', () =>
        confirm.getByTestId('calendar-rewrite-cancel').click(),
      )
      await check(page, '書き直さずに、予定の確認のダイアログに戻る', async () => {
        await expect(confirm).toBeHidden()
        await expect(detail).toBeVisible()
      })
    })
  })
})
