import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_EMAIL, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { alertMessages, invalidSummaryItems } from '../../selectors/formField'

/** 職員の一覧から職員の登録のダイアログを開き、ダイアログを返す。 */
const openStaffCreate = async (page: Page) => {
  await page.goto('/staff')
  await expect(page.getByTestId('staff-list-new')).toBeVisible()
  await page.getByTestId('staff-list-new').click()
  const dialog = page.getByTestId('staff-new-dialog')
  await expect(dialog.getByTestId('staff-new-name')).toBeFocused()
  return dialog
}

test.describe('入力の欄の誤り', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('field-error-focus-first 職員の登録で名前とメールアドレスを空のまま登録を押した場合、名前の欄にフォーカスが移り、誤りの文が欄の説明になること', async ({
      page,
    }) => {
      const dialog = await openStaffCreate(page)
      await intro(
        page,
        '職員の登録で名前とメールアドレスを空のまま「登録」を押すと、名前の欄にフォーカスが移り、誤りの文が欄の説明になる\n前提 職員の登録のダイアログを、何も入れずに開いている',
      )

      await step(page, '「登録」を押す', () => dialog.getByTestId('staff-new-submit').click())
      await check(
        page,
        '名前の欄にフォーカスが移り、欄の説明が「名前を入れてください」になる。割り込みで読み上げる要素は無い',
        async () => {
          const name = dialog.getByTestId('staff-new-name')
          await expect(name).toBeFocused()
          await expect(name).toHaveAccessibleDescription('名前を入れてください')
          await expect(alertMessages(dialog)).toHaveCount(0)
        },
      )
    })

    test('field-error-focus-tab 誤りを出した後に 2 つ目の誤りの欄へ Tab で移った場合、その欄の誤りの文が欄の説明になること', async ({
      page,
    }) => {
      const dialog = await openStaffCreate(page)
      await intro(
        page,
        '誤りを出した後にメールアドレスの欄へ Tab で移ると、その欄の誤りの文が欄の説明になる\n前提 職員の登録のダイアログを、何も入れずに開いている',
      )

      await step(
        page,
        '名前とメールアドレスを空のまま「登録」を押し、名前の欄にフォーカスがある',
        async () => {
          await dialog.getByTestId('staff-new-submit').click()
          await expect(dialog.getByTestId('staff-new-name')).toBeFocused()
        },
      )
      await step(page, 'Tab を押す', () => page.keyboard.press('Tab'))
      await check(
        page,
        'メールアドレスの欄にフォーカスが移り、欄の説明がメールアドレスの誤りの文になる',
        async () => {
          const email = dialog.getByTestId('staff-new-email')
          await expect(email).toBeFocused()
          await expect(email).toHaveAccessibleDescription(/メールアドレス/)
        },
      )
    })

    test('field-error-focus-schedule 予定の作成で必須の項目を入れずに作成を押した場合、左の一覧の最初の誤りの項目にフォーカスが移ること', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
      await page.getByTestId('schedule-create-open').click()
      const modal = page.getByTestId('schedule-form-modal')
      await expect(modal).toBeVisible()
      await intro(
        page,
        '予定の作成で必須の項目を入れずに送ると、左の一覧の最初の誤りの項目にフォーカスが移る\n前提 予定の作成のダイアログを、何も入れずに開いている',
      )

      await step(page, '下端の送信のボタンを押す', () =>
        page.getByTestId('schedule-create-submit').click(),
      )
      await check(page, '左の一覧の、最初の誤りを出した項目にフォーカスが移る', async () => {
        await expect(invalidSummaryItems(modal).first()).toBeFocused()
        await expect(alertMessages(modal)).toHaveCount(0)
      })
    })

    test('field-error-submit-alert 職員の登録が登録済みのメールアドレスで送れなかった場合、フッターの文を割り込みで読み上げること', async ({
      page,
    }) => {
      const dialog = await openStaffCreate(page)
      await intro(
        page,
        '職員の登録が登録済みのメールアドレスで送れなかったとき、フッターの文を今と同じく割り込みで読み上げる\n前提 職員の登録のダイアログを開いている',
      )

      await step(
        page,
        `名前を入れ、メールアドレスに登録済みの ${LOGIN_EMAIL} を入れて「登録」を押す`,
        async () => {
          await dialog.getByTestId('staff-new-name').fill('重複 確認')
          await dialog.getByTestId('staff-new-email').fill(LOGIN_EMAIL)
          await dialog.getByTestId('staff-new-submit').click()
        },
      )
      await check(
        page,
        'フッターに送れなかった理由の文が出て、文に role="alert" が付いている',
        async () => {
          const error = dialog.getByTestId('staff-new-submit-error')
          await expect(error).toBeVisible()
          await expect(error).toHaveAttribute('role', 'alert')
        },
      )
    })
  })
})
