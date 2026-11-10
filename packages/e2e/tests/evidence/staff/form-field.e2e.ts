import { expect, test, type APIRequestContext } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { issueManagerToken, newStaff, registerStaffId } from '../../fixtures/staff'
import { fieldLabel } from '../../selectors/formField'

/** 録画の外で、マネージャーのトークンで職員を 1 人登録し、その ID を返す。 */
const registerStaff = async (request: APIRequestContext, label: string) =>
  registerStaffId(request, await issueManagerToken(), newStaff(label))

test.describe('職員の入力の欄', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('staff-create-name-error 職員の登録で名前を空のまま登録を押した場合、名前の欄の下に誤りの文が出て、欄の枠が強まること', async ({
      page,
    }) => {
      await page.goto('/staff')
      await expect(page.getByTestId('staff-list-new')).toBeVisible()
      await intro(
        page,
        '職員の登録で名前を空のまま登録を押すと、名前の欄の下に誤りの文が出て、欄の枠が強まる',
      )

      await check(page, '前提 職員の一覧を開いている', () =>
        expect(page.getByTestId('staff-list-new')).toBeVisible(),
      )
      const dialog = page.getByTestId('staff-new-dialog')
      await step(page, '「職員を登録」を押し、名前を空のまま「登録」を押す', async () => {
        await page.getByTestId('staff-list-new').click()
        await dialog.getByTestId('staff-new-submit').click()
      })
      await check(page, '名前の欄の下に誤りの文が出て、名前の欄の枠が赤く太くなる', async () => {
        await expect(dialog.getByTestId('staff-new-error-name')).toBeVisible()
        await expect(dialog.getByTestId('staff-new-name')).toHaveAttribute('aria-invalid', 'true')
      })
    })

    test('staff-profile-phone-label-focus 職員のプロフィールの編集で電話番号の見出しを押した場合、電話番号の欄にフォーカスが移ること', async ({
      context,
      request,
    }) => {
      const id = await registerStaff(request, 'label-focus')

      const page = await context.newPage()
      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-edit')).toBeVisible()
      await intro(
        page,
        '職員のプロフィールの編集で電話番号の見出しを押すと、電話番号の欄にフォーカスが移る',
      )

      await check(page, '前提 撮影の前に登録した職員の詳細を開いている', () =>
        expect(page.getByTestId('staff-detail-edit')).toBeVisible(),
      )
      const dialog = page.getByTestId('staff-detail-edit-dialog')
      await step(page, '「編集」を押し、「電話番号（任意）」の見出しを押す', async () => {
        await page.getByTestId('staff-detail-edit').click()
        await expect(dialog.getByTestId('staff-detail-name-input')).toBeFocused()
        await fieldLabel(dialog, '電話番号（任意）').click()
      })
      await check(page, '電話番号の欄にフォーカスが移る', () =>
        expect(dialog.getByTestId('staff-detail-phone-input')).toBeFocused(),
      )
    })

    test('staff-leave-return-date-hint 職員の休職のダイアログを開いた場合、戻る予定の日の欄の下に補足の文が出ること', async ({
      context,
      request,
    }) => {
      const id = await registerStaff(request, 'leave-hint')

      const page = await context.newPage()
      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
      await intro(page, '職員の休職のダイアログを開くと、戻る予定の日の欄の下に補足の文が出る')

      await check(page, '前提 撮影の前に登録した職員の詳細を開いている', () =>
        expect(page.getByTestId('staff-detail-menu')).toBeVisible(),
      )
      const dialog = page.getByTestId('staff-leave-dialog')
      const date = dialog.getByTestId('staff-leave-return-date')
      await step(page, '「…」から「休職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-leave').click()
        await expect(dialog.getByTestId('staff-leave-assignments')).toBeVisible()
        await date.scrollIntoViewIfNeeded()
      })
      await check(page, '戻る予定の日の見出し、欄、補足の文が、この順に縦に並ぶ', async () => {
        await expect(date).toHaveAccessibleName('戻る予定の日（任意）')
        await expect(date).toHaveAccessibleDescription(
          'メモとして残します。この日に自動では戻りません。',
        )
      })
    })
  })
})
