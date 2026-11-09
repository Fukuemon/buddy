import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { alertMessages, invalidSummaryItems } from '../../selectors/formField'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** マネージャーでログインし、path の画面を開く。 */
const signInAt = (path: string) => async (page: Page) => {
  await page.goto(path)
  await signInAtBroker(page, LOGIN_EMAIL)
}

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
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の登録で名前とメールアドレスを空のまま登録を押した場合、名前の欄にフォーカスが移り、誤りの文が欄の説明になること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'field-error-focus-first',
          title:
            '職員の登録で名前とメールアドレスを空のまま「登録」を押すと、名前の欄にフォーカスが移り、誤りの文が欄の説明になる',
          actor: MANAGER,
          variant,
        },
        signInAt('/staff'),
        async ({ page, step, check }) => {
          const dialog = await openStaffCreate(page)
          await step('職員の登録のダイアログを、何も入れずに開いている')

          await step('「登録」を押す')
          await dialog.getByTestId('staff-new-submit').click()
          const name = dialog.getByTestId('staff-new-name')
          await expect(name).toBeFocused()
          await expect(name).toHaveAccessibleDescription('名前を入れてください')
          await expect(alertMessages(dialog)).toHaveCount(0)
          await check(
            '名前の欄にフォーカスが移り、欄の説明が「名前を入れてください」になる。割り込みで読み上げる要素は無い',
          )
        },
      )
    })

    test(`${prefix}誤りを出した後に 2 つ目の誤りの欄へ Tab で移った場合、その欄の誤りの文が欄の説明になること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'field-error-focus-tab',
          title:
            '誤りを出した後にメールアドレスの欄へ Tab で移ると、その欄の誤りの文が欄の説明になる',
          actor: MANAGER,
          variant,
        },
        signInAt('/staff'),
        async ({ page, step, check }) => {
          const dialog = await openStaffCreate(page)
          await dialog.getByTestId('staff-new-submit').click()
          await expect(dialog.getByTestId('staff-new-name')).toBeFocused()
          await step('名前とメールアドレスを空のまま「登録」を押し、名前の欄にフォーカスがある')

          await step('Tab を押す')
          await page.keyboard.press('Tab')
          const email = dialog.getByTestId('staff-new-email')
          await expect(email).toBeFocused()
          await expect(email).toHaveAccessibleDescription(/メールアドレス/)
          await check(
            'メールアドレスの欄にフォーカスが移り、欄の説明がメールアドレスの誤りの文になる',
          )
        },
      )
    })

    test(`${prefix}予定の作成で必須の項目を入れずに作成を押した場合、左の一覧の最初の誤りの項目にフォーカスが移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'field-error-focus-schedule',
          title:
            '予定の作成で必須の項目を入れずに送ると、左の一覧の最初の誤りの項目にフォーカスが移る',
          actor: `${LOGIN_STAFF.name}（マネージャー）`,
          variant,
        },
        signInAt('/schedule'),
        async ({ page, step, check }) => {
          await page.goto('/schedule?view=day')
          await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
          await page.getByTestId('schedule-create-open').click()
          const modal = page.getByTestId('schedule-form-modal')
          await expect(modal).toBeVisible()
          await step('予定の作成のダイアログを、何も入れずに開いている')

          await step('下端の送信のボタンを押す')
          await page.getByTestId('schedule-create-submit').click()
          const firstInvalid = invalidSummaryItems(modal).first()
          await expect(firstInvalid).toBeFocused()
          await expect(alertMessages(modal)).toHaveCount(0)
          await check('左の一覧の、最初の誤りを出した項目にフォーカスが移る')
        },
      )
    })

    test(`${prefix}職員の登録が登録済みのメールアドレスで送れなかった場合、フッターの文を割り込みで読み上げること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'field-error-submit-alert',
          title:
            '職員の登録が登録済みのメールアドレスで送れなかったとき、フッターの文を今と同じく割り込みで読み上げる',
          actor: MANAGER,
          variant,
        },
        signInAt('/staff'),
        async ({ page, step, check }) => {
          const dialog = await openStaffCreate(page)
          await step('職員の登録のダイアログを開いている')

          await step(`名前を入れ、メールアドレスに登録済みの ${LOGIN_EMAIL} を入れて「登録」を押す`)
          await dialog.getByTestId('staff-new-name').fill('重複 確認')
          await dialog.getByTestId('staff-new-email').fill(LOGIN_EMAIL)
          await dialog.getByTestId('staff-new-submit').click()
          const error = dialog.getByTestId('staff-new-submit-error')
          await expect(error).toBeVisible()
          await expect(error).toHaveAttribute('role', 'alert')
          await check('フッターに送れなかった理由の文が出て、文に role="alert" が付いている')
        },
      )
    })
  }
})
