import { expect, test, type Page } from '@playwright/test'

import { HAYASHI, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { findGoogleEvent, holdGoogleChanges, shiftGoogleEvent } from '../../fixtures/googleCalendar'
import { SCHEDULE_DETAIL_URL, scheduleIdFromUrl } from '../../fixtures/schedule'
import { linkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'
import { commonShapeParts } from '../../selectors/commonShape'
import { pageRoot } from '../../selectors/page'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

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

/** ログインし、確認が必要な予定に単発の予定の行が 1 件も無ければ作る。前の撮影の行があれば、それを使う。 */
const prepareReview = async (page: Page) => {
  await page.goto('/schedule/review')
  await signInAtBroker(page, LOGIN_EMAIL)
  await expect(page.getByTestId('calendar-review-loading')).toBeHidden()
  if ((await scheduleRows(page).count()) > 0) return
  await ensureHayashiLinked(page)
  await createConflict(page)
}

test.describe('画面の共通の形', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}スマートフォンの幅で確認が必要な予定を開いた場合、予定が 2 行のリストで並び、横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-list-phone',
          title: 'スマートフォンの幅で確認が必要な予定を開き、2 行のリストの行を見る',
          actor: ACTOR,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        prepareReview,
        async ({ page, step, check }) => {
          await page.goto('/schedule/review')
          const row = scheduleRows(page).first()
          await expect(row).toBeVisible()
          await step('スマートフォンの幅（390x844）で、確認が必要な予定の画面を開いている')
          await expect(row.getByTestId(/^calendar-review-reason-/)).toBeHidden()
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await check(
            '行の 1 行目に予定の日時、2 行目に職員と最後に変わった日時が「・」でつながって並び、理由は出ない。画面は横にスクロールしない',
          )
        },
      )
    })

    test(`${prefix}buddy を正本にする事業所で確認が必要な予定の行を押した場合、予定と、buddy の内容で書き直すと、閉じるためのボタンを入れたダイアログが出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-detail-dialog',
          title:
            'buddy を正本にする事業所で確認が必要な予定の行を押し、予定と書き直すだけを入れたダイアログを見て、閉じる',
          actor: ACTOR,
          variant,
        },
        prepareReview,
        async ({ page, step, check }) => {
          await page.goto('/schedule/review')
          const row = scheduleRows(page).first()
          await expect(row).toBeVisible()
          await expect(commonShapeParts(row).buttons).toHaveCount(1)
          await step('確認が必要な予定の画面を開いている。行に、行ごとのボタンは無い')

          await step('1 行目の予定の行を押す')
          await row.click()
          const dialog = page.getByTestId('calendar-review-dialog')
          await expect(dialog).toBeVisible()
          await expect(dialog.getByTestId('calendar-review-dialog-datetime')).toBeVisible()
          await expect(dialog.getByTestId('calendar-review-dialog-reason')).toBeVisible()
          const rewrite = dialog.getByTestId(/^calendar-review-rewrite-/)
          await expect(rewrite).not.toHaveClass(/bg-primary/)
          await expect(dialog).not.toContainText('Google の内容に合わせる')
          if (variant.name === 'before') {
            await check(
              '「食い違った予定」のダイアログに、予定の日時、職員、最後に変わった日時、理由、予定を開くが出て、右上に × があり、フッターに「buddy の内容で書き直す」だけが主ボタンの色でなく出る',
            )

            await step('右上の × を押す')
            await commonShapeParts(dialog).closeButton.click()
          } else {
            await expect(commonShapeParts(dialog).closeButton).toHaveCount(0)
            await expect(rewrite).toHaveClass(/text-danger/)
            await expect(dialog.getByTestId('calendar-review-cancel')).toHaveText('閉じる')
            await check(
              '「食い違った予定」のダイアログに、予定の日時、職員、最後に変わった日時、理由、予定を開くが出て、右上に × が無く、フッターの左端に赤い文字の「buddy の内容で書き直す」と、右に「閉じる」が出る',
            )

            await step('フッターの「閉じる」を押す')
            await dialog.getByTestId('calendar-review-cancel').click()
          }
          await expect(dialog).toBeHidden()
          await check('ダイアログが閉じ、一覧に戻る')
        },
      )
    })

    test(`${prefix}buddy の内容で書き直すを確定するダイアログを開いた場合、確定のボタンが赤で出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'review-rewrite-confirm',
          title:
            '予定の確認のダイアログで buddy の内容で書き直すを押し、確定のボタンの色を見て、戻るで戻る',
          actor: ACTOR,
          variant,
        },
        prepareReview,
        async ({ page, step, check }) => {
          await page.goto('/schedule/review')
          await scheduleRows(page).first().click()
          const detail = page.getByTestId('calendar-review-dialog')
          await expect(detail).toBeVisible()
          await step('確認が必要な予定の 1 行目を押し、予定の確認のダイアログを開いている')

          await step('「buddy の内容で書き直す」を押す')
          await detail.getByTestId(/^calendar-review-rewrite-/).click()
          const confirm = page.getByTestId('calendar-rewrite-dialog')
          await expect(confirm).toBeVisible()
          await expect(confirm.getByTestId('calendar-rewrite-submit')).toHaveClass(/bg-danger/)
          await check(
            '「buddy の内容で書き直しますか」の確認のダイアログが出て、確定の「書き直す」が赤い面で出る。× は無い',
          )

          await step('「戻る」を押す')
          await confirm.getByTestId('calendar-rewrite-cancel').click()
          await expect(confirm).toBeHidden()
          await expect(detail).toBeVisible()
          await check('書き直さずに、予定の確認のダイアログに戻る')
        },
      )
    })

    test(`${prefix}スマートフォンの幅でカレンダーの連携を開いた場合、職員が 2 行のリストで並び、外すは行のメニューにあること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'link-list-phone',
          title:
            'スマートフォンの幅でカレンダーの連携を開き、2 行のリストの行と、行の操作のメニューを見る',
          actor: ACTOR,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        async (page) => {
          await page.goto('/schedule/link')
          await signInAtBroker(page, LOGIN_EMAIL)
          await ensureHayashiLinked(page)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule/link')
          const row = page.getByTestId(`calendar-link-row-${HAYASHI.id}`)
          await row.scrollIntoViewIfNeeded()
          await expect(page.getByTestId(`calendar-link-remove-${HAYASHI.id}`)).toHaveCount(0)
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await step('スマートフォンの幅（390x844）で、カレンダーの連携の画面を開いている')
          await check(
            `職員の行は、1 行目に職員の名前と行の操作、2 行目にカレンダーの ID と最後の取り込みが並ぶ。結び付けた ${HAYASHI.name} の行に「外す」のボタンは無く、画面は横にスクロールしない`,
          )

          await step(`${HAYASHI.name} の行の右端の「…」を押す`)
          await page.getByTestId(`calendar-link-menu-${HAYASHI.id}`).click()
          const menu = page.getByTestId(`calendar-link-menu-list-${HAYASHI.id}`)
          await page.getByTestId(`calendar-link-remove-${HAYASHI.id}`).scrollIntoViewIfNeeded()
          await expect(commonShapeParts(menu).menuItems).toHaveText(['取り込む', '外す'])
          await check('メニューに「取り込む」と、赤の「外す」がこの順に出る')
        },
      )
    })
  }
})
