import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { issueManagerToken, newStaff, registerStaffId } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { fieldLabel } from '../../selectors/formField'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** マネージャーでログインする。 */
const signInManager = async (page: Page) => {
  await page.goto('/staff')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** マネージャーでログインし、撮影の前に職員を 1 人登録して、その ID を返す。 */
const prepareStaff = (label: string) => async (page: Page) => {
  await signInManager(page)
  const id = await registerStaffId(
    page.request,
    await issueManagerToken(page.request),
    newStaff(label),
  )
  return { id }
}

test.describe('職員の入力の欄', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の登録で名前を空のまま登録を押した場合、名前の欄の下に誤りの文が出て、欄の枠が強まること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-create-name-error',
          title:
            '職員の登録で名前を空のまま登録を押すと、名前の欄の下に誤りの文が出て、欄の枠が強まる',
          actor: MANAGER,
          variant,
        },
        signInManager,
        async ({ page, step, check }) => {
          await page.goto('/staff')
          await expect(page.getByTestId('staff-list-new')).toBeVisible()
          await step('職員の一覧を開いている')

          await step('「職員を登録」を押し、名前を空のまま「登録」を押す')
          await page.getByTestId('staff-list-new').click()
          const dialog = page.getByTestId('staff-new-dialog')
          await dialog.getByTestId('staff-new-submit').click()
          await expect(dialog.getByTestId('staff-new-error-name')).toBeVisible()
          await expect(dialog.getByTestId('staff-new-name')).toHaveAttribute('aria-invalid', 'true')
          await check('名前の欄の下に誤りの文が出て、名前の欄の枠が赤く太くなる')
        },
      )
    })

    test(`${prefix}職員のプロフィールの編集で電話番号の見出しを押した場合、電話番号の欄にフォーカスが移ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-profile-phone-label-focus',
          title:
            '職員のプロフィールの編集で電話番号の見出しを押すと、電話番号の欄にフォーカスが移る',
          actor: MANAGER,
          variant,
        },
        prepareStaff('label-focus'),
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-edit')).toBeVisible()
          await step('撮影の前に登録した職員の詳細を開いている')

          await step('「編集」を押し、「電話番号（任意）」の見出しを押す')
          await page.getByTestId('staff-detail-edit').click()
          const dialog = page.getByTestId('staff-detail-edit-dialog')
          await expect(dialog.getByTestId('staff-detail-name-input')).toBeFocused()
          await fieldLabel(dialog, '電話番号（任意）').click()
          await expect(dialog.getByTestId('staff-detail-phone-input')).toBeFocused()
          await check('電話番号の欄にフォーカスが移る')
        },
      )
    })

    test(`${prefix}職員の休職のダイアログを開いた場合、戻る予定の日の欄の下に補足の文が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-leave-return-date-hint',
          title: '職員の休職のダイアログを開くと、戻る予定の日の欄の下に補足の文が出る',
          actor: MANAGER,
          variant,
        },
        prepareStaff('leave-hint'),
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
          await step('撮影の前に登録した職員の詳細を開いている')

          await step('「…」から「休職にする」を押す')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-leave').click()
          const dialog = page.getByTestId('staff-leave-dialog')
          await expect(dialog.getByTestId('staff-leave-assignments')).toBeVisible()
          const date = dialog.getByTestId('staff-leave-return-date')
          await date.scrollIntoViewIfNeeded()
          await expect(date).toHaveAccessibleName('戻る予定の日（任意）')
          await expect(date).toHaveAccessibleDescription(
            'メモとして残します。この日に自動では戻りません。',
          )
          await check('戻る予定の日の見出し、欄、補足の文が、この順に縦に並ぶ')
        },
      )
    })
  }
})
