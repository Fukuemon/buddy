import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { SCHEDULE_DETAIL_URL } from '../../fixtures/schedule'
import { commonShapeParts } from '../../selectors/commonShape'

/** 録画の外で、ログインした職員の通常の予定を日の表示から作る。作った予定のタイトルを返す。 */
const prepareSchedule = (browser: Browser) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
    await page.goto('/schedule?view=day')
    const title = `打ち合わせ ${Date.now()}`
    await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
    await page.getByTestId('schedule-create-open').click()
    await page.getByTestId('schedule-kind-tab-normal').check()
    await page.getByTestId('schedule-field-title').click()
    await page.getByTestId('schedule-form-title').fill(title)
    await page.getByTestId('schedule-field-staff').click()
    await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()
    await page.getByTestId('schedule-create-submit').click()
    await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
    return title
  })

const openDay = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

/** 日の表示で、タイトルが title の予定を押し、予定の詳細を開く。 */
const openDetail = async (page: Page, title: string) => {
  await page
    .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })
    .click()
  await expect(page).toHaveURL(SCHEDULE_DETAIL_URL)
  return page.getByTestId('schedule-detail-modal')
}

/** タイトルがダイアログの左上にあり、右上に × が無いことを確認する。 */
const expectTitleWithoutClose = async (modal: Locator) => {
  const title = await commonShapeParts(modal).title.boundingBox()
  const box = await modal.boundingBox()
  expect((title?.x ?? 0) - (box?.x ?? 0)).toBeLessThan(40)
  await expect(modal.getByTestId('modal-close')).toHaveCount(0)
}

test.describe('予定のダイアログ', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-new-dialog-shape 予定の作成のダイアログを開いた場合、右上に × が無く、フッターにキャンセルがあること', async ({
      page,
    }) => {
      await openDay(page)
      await intro(
        page,
        '予定の作成のダイアログを開き、右上とキャンセルの位置を見て、キャンセルで閉じる',
      )

      await step(page, '予定のカレンダーの「予定を作成」を押す', () =>
        page.getByTestId('schedule-create-open').click(),
      )
      const modal = page.getByTestId('schedule-form-modal')
      await check(
        page,
        '「予定の作成」のダイアログの右上に × が無く、フッターの右に「キャンセル」と「作成」がこの順に並ぶ',
        async () => {
          await expect(modal).toBeVisible()
          await expectTitleWithoutClose(modal)
          await expect(modal.getByTestId('schedule-new-cancel')).toBeVisible()
        },
      )

      await step(page, '入力を変えずに「キャンセル」を押す', () =>
        modal.getByTestId('schedule-new-cancel').click(),
      )
      await check(page, '確認を出さずにダイアログが閉じ、予定のカレンダーに戻る', () =>
        expect(modal).toBeHidden(),
      )
    })

    test('schedule-detail-dialog-shape 予定の詳細のダイアログを開いた場合、右上に × が無く、フッターに閉じるがあること', async ({
      browser,
      context,
    }) => {
      const title = await prepareSchedule(browser)

      const page = await context.newPage()
      await openDay(page)
      await intro(
        page,
        `予定の詳細のダイアログを開き、右上と閉じるの位置を見て、閉じるで閉じる\n前提 日の表示の ${LOGIN_STAFF.name} の列に「${title}」がある`,
      )

      let modal = page.getByTestId('schedule-detail-modal')
      await step(page, `日の表示で、${LOGIN_STAFF.name} の「${title}」を押す`, async () => {
        modal = await openDetail(page, title)
      })
      await check(
        page,
        '「予定の詳細」のダイアログの右上に × が無く、フッターの右に「閉じる」と「編集」がこの順に並ぶ',
        async () => {
          await expect(modal).toBeVisible()
          await expectTitleWithoutClose(modal)
          await expect(modal.getByTestId('schedule-detail-close')).toBeVisible()
        },
      )

      await step(page, 'フッターの「閉じる」を押す', () =>
        modal.getByTestId('schedule-detail-close').click(),
      )
      await check(page, 'ダイアログが閉じ、予定のカレンダーに戻る', () =>
        expect(modal).toBeHidden(),
      )
    })

    test('schedule-edit-dialog-shape 予定の編集のダイアログを開いた場合、右上に × が無く、フッターにキャンセルがあること', async ({
      browser,
      context,
    }) => {
      const title = await prepareSchedule(browser)

      const page = await context.newPage()
      await openDay(page)
      const detail = await openDetail(page, title)
      await expect(detail).toBeVisible()
      await intro(
        page,
        `予定の編集のダイアログを開き、右上とキャンセルの位置を見て、キャンセルで詳細に戻る\n前提 「${title}」の予定の詳細を開いている`,
      )

      await step(page, `「${title}」の予定の詳細で、「編集」を押す`, () =>
        detail.getByTestId('schedule-detail-edit').click(),
      )
      const modal = page.getByTestId('schedule-form-modal')
      await check(
        page,
        '「予定の編集」のダイアログの右上に × が無く、フッターの右に「キャンセル」と「保存」がこの順に並ぶ',
        async () => {
          await expect(modal.getByTestId('schedule-edit-cancel')).toBeVisible()
          await expectTitleWithoutClose(modal)
        },
      )

      await step(page, '入力を変えずに「キャンセル」を押す', () =>
        modal.getByTestId('schedule-edit-cancel').click(),
      )
      await check(page, '確認を出さずに、予定の詳細に戻る', () =>
        expect(page.getByTestId('schedule-detail-modal')).toBeVisible(),
      )
    })
  })
})
