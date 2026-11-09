import { expect, test, type Locator, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { SCHEDULE_DETAIL_URL } from '../../fixtures/schedule'
import { signInAtBroker } from '../../screens/login'
import { commonShapeParts } from '../../selectors/commonShape'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

/** ログインした職員の通常の予定を、日の表示から作る。作った予定のタイトルを返す。 */
const prepareSchedule = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await signInAtBroker(page, LOGIN_EMAIL)
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
}

/** 日の表示で、タイトルが title の予定を押し、予定の詳細を開く。 */
const openDetail = async (page: Page, title: string) => {
  await page.goto('/schedule?view=day')
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
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}予定の作成のダイアログを開いた場合、右上に × が無く、フッターにキャンセルがあること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-new-dialog-shape',
          title: '予定の作成のダイアログを開き、右上とキャンセルの位置を見て、キャンセルで閉じる',
          actor: ACTOR,
          variant,
        },
        async (page) => {
          await page.goto('/schedule?view=day')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule?view=day')
          await step('予定のカレンダーの「予定を作成」を押す')
          await page.getByTestId('schedule-create-open').click()
          const modal = page.getByTestId('schedule-form-modal')
          await expect(modal).toBeVisible()
          await expectTitleWithoutClose(modal)
          await expect(modal.getByTestId('schedule-new-cancel')).toBeVisible()
          await check(
            '「予定の作成」のダイアログの右上に × が無く、フッターの右に「キャンセル」と「作成」がこの順に並ぶ',
          )

          await step('入力を変えずに「キャンセル」を押す')
          await modal.getByTestId('schedule-new-cancel').click()
          await expect(modal).toBeHidden()
          await check('確認を出さずにダイアログが閉じ、予定のカレンダーに戻る')
        },
      )
    })

    test(`${prefix}予定の詳細のダイアログを開いた場合、右上に × が無く、フッターに閉じるがあること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-detail-dialog-shape',
          title: '予定の詳細のダイアログを開き、右上と閉じるの位置を見て、閉じるで閉じる',
          actor: ACTOR,
          variant,
        },
        prepareSchedule,
        async ({ page, step, check }, title) => {
          await step(`日の表示で、${LOGIN_STAFF.name} の「${title}」を押す`)
          const modal = await openDetail(page, title)
          await expect(modal).toBeVisible()
          await expectTitleWithoutClose(modal)
          await expect(modal.getByTestId('schedule-detail-close')).toBeVisible()
          await check(
            '「予定の詳細」のダイアログの右上に × が無く、フッターの右に「閉じる」と「編集」がこの順に並ぶ',
          )

          await step('フッターの「閉じる」を押す')
          await modal.getByTestId('schedule-detail-close').click()
          await expect(modal).toBeHidden()
          await check('ダイアログが閉じ、予定のカレンダーに戻る')
        },
      )
    })

    test(`${prefix}予定の編集のダイアログを開いた場合、右上に × が無く、フッターにキャンセルがあること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-edit-dialog-shape',
          title:
            '予定の編集のダイアログを開き、右上とキャンセルの位置を見て、キャンセルで詳細に戻る',
          actor: ACTOR,
          variant,
        },
        prepareSchedule,
        async ({ page, step, check }, title) => {
          const detail = await openDetail(page, title)
          await step(`「${title}」の予定の詳細で、「編集」を押す`)
          await detail.getByTestId('schedule-detail-edit').click()
          const modal = page.getByTestId('schedule-form-modal')
          await expect(modal.getByTestId('schedule-edit-cancel')).toBeVisible()
          await expectTitleWithoutClose(modal)
          await check(
            '「予定の編集」のダイアログの右上に × が無く、フッターの右に「キャンセル」と「保存」がこの順に並ぶ',
          )

          await step('入力を変えずに「キャンセル」を押す')
          await modal.getByTestId('schedule-edit-cancel').click()
          await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
          await check('確認を出さずに、予定の詳細に戻る')
        },
      )
    })
  }
})
